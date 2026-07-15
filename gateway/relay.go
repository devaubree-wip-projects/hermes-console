package gateway

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

type relayFrame struct {
	Type             string           `json:"type"`
	ID               string           `json:"id"`
	Method           string           `json:"method,omitempty"`
	Path             string           `json:"path,omitempty"`
	RawQuery         string           `json:"rawQuery,omitempty"`
	Header           http.Header      `json:"header,omitempty"`
	Body             []byte           `json:"body,omitempty"`
	Status           int              `json:"status,omitempty"`
	MessageType      int              `json:"messageType,omitempty"`
	Error            string           `json:"error,omitempty"`
	ProtocolVersion  int              `json:"protocolVersion,omitempty"`
	HeartbeatSeconds int              `json:"heartbeatSeconds,omitempty"`
	Limits           map[string]int64 `json:"limits,omitempty"`
}

type relaySocket struct {
	connection *websocket.Conn
	writeMu    sync.Mutex
}

func (socket *relaySocket) write(frame relayFrame) error {
	socket.writeMu.Lock()
	defer socket.writeMu.Unlock()
	return socket.connection.WriteMessage(frame.MessageType, frame.Body)
}

type relayPeer struct {
	identity  RelayIdentity
	conn      *websocket.Conn
	writeMu   sync.Mutex
	mu        sync.Mutex
	pending   map[string]chan relayFrame
	sockets   map[string]*relaySocket
	closed    chan struct{}
	closeOnce sync.Once
	lastSeen  atomic.Int64
}

func (peer *relayPeer) send(frame relayFrame) error {
	peer.writeMu.Lock()
	defer peer.writeMu.Unlock()
	_ = peer.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return peer.conn.WriteJSON(frame)
}

func (peer *relayPeer) close() {
	peer.closeOnce.Do(func() {
		close(peer.closed)
		_ = peer.conn.Close()
		peer.mu.Lock()
		defer peer.mu.Unlock()
		for _, response := range peer.pending {
			close(response)
		}
		for _, socket := range peer.sockets {
			_ = socket.connection.Close()
		}
		peer.pending = map[string]chan relayFrame{}
		peer.sockets = map[string]*relaySocket{}
	})
}

type Relay struct {
	config         Config
	logger         *slog.Logger
	mux            *http.ServeMux
	mu             sync.RWMutex
	peers          map[string]*relayPeer
	revoked        map[string]time.Time
	replays        *ReplayGuard
	connectedTotal atomic.Int64
	routedHTTP     atomic.Int64
	routedWS       atomic.Int64
	proxyFailures  atomic.Int64
}

func NewRelay(config Config, logger *slog.Logger) *Relay {
	if config.RelayMaxConnections <= 0 {
		config.RelayMaxConnections = 1024
	}
	if config.RelayMaxConnectionsPerTenant <= 0 {
		config.RelayMaxConnectionsPerTenant = 128
	}
	if config.RelayMaxFrameBytes <= 0 {
		config.RelayMaxFrameBytes = 4 << 20
	}
	relay := &Relay{config: config, logger: logger, mux: http.NewServeMux(), peers: make(map[string]*relayPeer), revoked: make(map[string]time.Time), replays: NewReplayGuard()}
	relay.loadRevocations()
	relay.mux.HandleFunc("GET /healthz", relay.health)
	relay.mux.HandleFunc("GET /metrics", relay.metrics)
	relay.mux.HandleFunc("GET /v1/relay/connect", relay.connect)
	relay.mux.HandleFunc("POST /v1/relay/admin/revoke", relay.revoke)
	relay.mux.HandleFunc("/v1/relay/installations/", relay.proxy)
	return relay
}

func (relay *Relay) metrics(w http.ResponseWriter, _ *http.Request) {
	relay.mu.RLock()
	connected := len(relay.peers)
	tenants := map[string]struct{}{}
	pending, sockets := 0, 0
	for _, peer := range relay.peers {
		tenants[peer.identity.TenantID] = struct{}{}
		peer.mu.Lock()
		pending += len(peer.pending)
		sockets += len(peer.sockets)
		peer.mu.Unlock()
	}
	revoked := len(relay.revoked)
	relay.mu.RUnlock()
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "hermes_relay_connected_edges %d\nhermes_relay_connected_tenants %d\nhermes_relay_pending_requests %d\nhermes_relay_open_websockets %d\nhermes_relay_revoked_identities %d\nhermes_relay_connections_total %d\nhermes_relay_http_requests_total %d\nhermes_relay_websockets_total %d\nhermes_relay_proxy_failures_total %d\n",
		connected, len(tenants), pending, sockets, revoked, relay.connectedTotal.Load(), relay.routedHTTP.Load(), relay.routedWS.Load(), relay.proxyFailures.Load())
}

func (relay *Relay) loadRevocations() {
	if relay.config.RelayRevocationFile == "" {
		return
	}
	contents, err := os.ReadFile(relay.config.RelayRevocationFile)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			relay.logger.Error("Cannot read Relay revocations", "error", err)
		}
		return
	}
	if json.Unmarshal(contents, &relay.revoked) != nil {
		relay.logger.Error("Cannot decode Relay revocations")
	}
}

func (relay *Relay) persistRevocationsLocked() error {
	if relay.config.RelayRevocationFile == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(relay.config.RelayRevocationFile), 0o700); err != nil {
		return err
	}
	contents, err := json.MarshalIndent(relay.revoked, "", "  ")
	if err != nil {
		return err
	}
	temporary := relay.config.RelayRevocationFile + ".tmp"
	if err := os.WriteFile(temporary, append(contents, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(temporary, relay.config.RelayRevocationFile)
}

func (relay *Relay) isRevoked(fingerprint string, now time.Time) bool {
	relay.mu.Lock()
	defer relay.mu.Unlock()
	expiresAt, found := relay.revoked[fingerprint]
	if found && !expiresAt.After(now) {
		delete(relay.revoked, fingerprint)
		_ = relay.persistRevocationsLocked()
		return false
	}
	return found
}

func (relay *Relay) Handler() http.Handler { return relay.mux }

func (relay *Relay) Close() {
	relay.mu.Lock()
	defer relay.mu.Unlock()
	for _, peer := range relay.peers {
		peer.close()
	}
	relay.peers = make(map[string]*relayPeer)
}

func (relay *Relay) health(w http.ResponseWriter, _ *http.Request) {
	relay.mu.RLock()
	connected := len(relay.peers)
	relay.mu.RUnlock()
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "service": "hermes-relay", "connectedEdges": connected})
}

func bearer(value string) string {
	prefix := "Bearer "
	if !strings.HasPrefix(value, prefix) {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(value, prefix))
}

func (relay *Relay) connect(w http.ResponseWriter, r *http.Request) {
	if r.TLS == nil || len(r.TLS.PeerCertificates) != 1 {
		http.Error(w, "mTLS client certificate required", http.StatusUnauthorized)
		return
	}
	identity, err := VerifyRelayIdentity(bearer(r.Header.Get("Authorization")), relay.config.RelayIdentitySecret, r.TLS.PeerCertificates[0].Raw, time.Now())
	if err != nil {
		http.Error(w, "invalid relay identity", http.StatusUnauthorized)
		return
	}
	if relay.isRevoked(identity.Fingerprint, time.Now()) {
		http.Error(w, "revoked relay identity", http.StatusUnauthorized)
		return
	}
	relay.mu.RLock()
	count := len(relay.peers)
	tenantCount := 0
	for _, candidate := range relay.peers {
		if candidate.identity.TenantID == identity.TenantID {
			tenantCount++
		}
	}
	_, replacing := relay.peers[identity.InstallationID]
	relay.mu.RUnlock()
	if !replacing && (count >= relay.config.RelayMaxConnections || tenantCount >= relay.config.RelayMaxConnectionsPerTenant) {
		http.Error(w, "relay connection capacity reached", http.StatusServiceUnavailable)
		return
	}
	connection, err := (&websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}).Upgrade(w, r, nil)
	if err != nil {
		return
	}
	connection.SetReadLimit(relay.config.RelayMaxFrameBytes)
	peer := &relayPeer{identity: identity, conn: connection, pending: make(map[string]chan relayFrame), sockets: make(map[string]*relaySocket), closed: make(chan struct{})}
	peer.lastSeen.Store(time.Now().UnixMilli())
	relay.mu.Lock()
	previous := relay.peers[identity.InstallationID]
	relay.peers[identity.InstallationID] = peer
	relay.mu.Unlock()
	if previous != nil {
		previous.close()
	}
	relay.logger.Info("Edge connected to relay", "tenantId", identity.TenantID, "installationId", identity.InstallationID)
	relay.connectedTotal.Add(1)
	peer.send(relayFrame{Type: "welcome", ID: identity.InstallationID, ProtocolVersion: 1, HeartbeatSeconds: 15, Limits: map[string]int64{"maxFrameBytes": relay.config.RelayMaxFrameBytes, "maxPendingRequests": 256}})
	relay.readPeer(peer)
	relay.mu.Lock()
	if relay.peers[identity.InstallationID] == peer {
		delete(relay.peers, identity.InstallationID)
	}
	relay.mu.Unlock()
	peer.close()
}

func (relay *Relay) revoke(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
	if err != nil {
		http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
		return
	}
	if _, err := VerifyServiceRequest(r, body, relay.config.ServiceSecret, "", time.Now()); err != nil || !relay.replays.Accept(r.Header.Get(serviceNonceHeader), time.Now()) {
		http.Error(w, "invalid service authentication", http.StatusUnauthorized)
		return
	}
	var command struct {
		InstallationID string   `json:"installationId"`
		Fingerprints   []string `json:"fingerprints"`
	}
	if json.Unmarshal(body, &command) != nil || command.InstallationID == "" || len(command.Fingerprints) == 0 || len(command.Fingerprints) > 10 {
		http.Error(w, "invalid revocation", http.StatusBadRequest)
		return
	}
	expiresAt := time.Now().Add(32 * 24 * time.Hour)
	relay.mu.Lock()
	for _, fingerprint := range command.Fingerprints {
		if len(fingerprint) != 64 {
			relay.mu.Unlock()
			http.Error(w, "invalid fingerprint", http.StatusBadRequest)
			return
		}
		relay.revoked[fingerprint] = expiresAt
	}
	peer := relay.peers[command.InstallationID]
	persistErr := relay.persistRevocationsLocked()
	relay.mu.Unlock()
	if persistErr != nil {
		http.Error(w, "revocation persistence failed", http.StatusInternalServerError)
		return
	}
	if peer != nil && containsString(command.Fingerprints, peer.identity.Fingerprint) {
		peer.close()
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "revoked": len(command.Fingerprints)})
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func (relay *Relay) readPeer(peer *relayPeer) {
	defer peer.close()
	for {
		var frame relayFrame
		if err := peer.conn.ReadJSON(&frame); err != nil {
			return
		}
		peer.lastSeen.Store(time.Now().UnixMilli())
		peer.mu.Lock()
		switch frame.Type {
		case "http_response", "ws_opened", "error":
			if response := peer.pending[frame.ID]; response != nil {
				select {
				case response <- frame:
				default:
				}
			}
		case "ws_data":
			if socket := peer.sockets[frame.ID]; socket != nil {
				if err := socket.write(frame); err != nil {
					_ = socket.connection.Close()
				}
			}
		case "ws_close":
			if socket := peer.sockets[frame.ID]; socket != nil {
				_ = socket.connection.Close()
				delete(peer.sockets, frame.ID)
			}
		}
		peer.mu.Unlock()
	}
}

func relayRequestID() string {
	value := make([]byte, 16)
	_, _ = rand.Read(value)
	return hex.EncodeToString(value)
}

func (relay *Relay) peer(installationID string) *relayPeer {
	relay.mu.RLock()
	defer relay.mu.RUnlock()
	peer := relay.peers[installationID]
	if peer != nil && time.Since(time.UnixMilli(peer.lastSeen.Load())) > 45*time.Second {
		return nil
	}
	return peer
}

func relayTarget(path string) (installationID, target string, ok bool) {
	remainder := strings.TrimPrefix(path, "/v1/relay/installations/")
	installationID, target, ok = strings.Cut(remainder, "/")
	if !ok || installationID == "" {
		return "", "", false
	}
	return installationID, "/" + target, true
}

func (relay *Relay) proxy(w http.ResponseWriter, r *http.Request) {
	installationID, target, ok := relayTarget(r.URL.Path)
	if !ok {
		http.NotFound(w, r)
		return
	}
	peer := relay.peer(installationID)
	if peer == nil {
		http.Error(w, "Edge offline", http.StatusServiceUnavailable)
		return
	}
	if websocket.IsWebSocketUpgrade(r) {
		relay.routedWS.Add(1)
		relay.proxyWebSocket(peer, target, w, r)
		return
	}
	relay.routedHTTP.Add(1)
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, relay.config.MaxRequestBodySize))
	if err != nil {
		http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
		return
	}
	response, err := relay.roundTrip(r.Context(), peer, relayFrame{
		Type: "http_request", ID: relayRequestID(), Method: r.Method, Path: target,
		RawQuery: r.URL.RawQuery, Header: cloneTunnelHeaders(r.Header), Body: body,
	})
	if err != nil {
		relay.proxyFailures.Add(1)
		http.Error(w, "Edge unavailable", http.StatusBadGateway)
		return
	}
	for key, values := range response.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.WriteHeader(response.Status)
	_, _ = w.Write(response.Body)
}

func cloneTunnelHeaders(source http.Header) http.Header {
	result := make(http.Header)
	for key, values := range source {
		lower := strings.ToLower(key)
		if lower == "content-type" || lower == "origin" || strings.HasPrefix(lower, "x-hermes-") {
			result[key] = append([]string(nil), values...)
		}
	}
	return result
}

func (relay *Relay) roundTrip(ctx context.Context, peer *relayPeer, request relayFrame) (relayFrame, error) {
	response := make(chan relayFrame, 1)
	peer.mu.Lock()
	if len(peer.pending) >= 256 {
		peer.mu.Unlock()
		return relayFrame{}, errors.New("relay backpressure")
	}
	peer.pending[request.ID] = response
	peer.mu.Unlock()
	defer func() { peer.mu.Lock(); delete(peer.pending, request.ID); peer.mu.Unlock() }()
	if err := peer.send(request); err != nil {
		return relayFrame{}, err
	}
	timer := time.NewTimer(15 * time.Second)
	defer timer.Stop()
	select {
	case frame, open := <-response:
		if !open || frame.Type == "error" {
			return relayFrame{}, errors.New(frame.Error)
		}
		return frame, nil
	case <-peer.closed:
		return relayFrame{}, errors.New("edge disconnected")
	case <-ctx.Done():
		return relayFrame{}, ctx.Err()
	case <-timer.C:
		return relayFrame{}, errors.New("edge response timeout")
	}
}

func (relay *Relay) proxyWebSocket(peer *relayPeer, target string, w http.ResponseWriter, r *http.Request) {
	client, err := (&websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}).Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer client.Close()
	id := relayRequestID()
	response, err := relay.roundTrip(r.Context(), peer, relayFrame{Type: "ws_open", ID: id, Path: target, RawQuery: r.URL.RawQuery, Header: cloneTunnelHeaders(r.Header)})
	if err != nil || response.Type != "ws_opened" {
		_ = client.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseTryAgainLater, "Edge unavailable"), time.Now().Add(time.Second))
		return
	}
	socket := &relaySocket{connection: client}
	peer.mu.Lock()
	peer.sockets[id] = socket
	peer.mu.Unlock()
	defer func() {
		peer.mu.Lock()
		delete(peer.sockets, id)
		peer.mu.Unlock()
		_ = peer.send(relayFrame{Type: "ws_close", ID: id})
	}()
	for {
		messageType, body, readErr := client.ReadMessage()
		if readErr != nil {
			return
		}
		if int64(len(body)) > relay.config.RelayMaxFrameBytes {
			return
		}
		if peer.send(relayFrame{Type: "ws_data", ID: id, MessageType: messageType, Body: body}) != nil {
			return
		}
	}
}

var _ = json.Marshal
