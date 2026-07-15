package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

type Server struct {
	config               Config
	logger               *slog.Logger
	httpClient           *http.Client
	hub                  *SessionHub
	mux                  *http.ServeMux
	draining             atomic.Bool
	replays              *ReplayGuard
	ticketsRevokedBefore atomic.Int64
}

func NewServer(config Config, logger *slog.Logger) *Server {
	client := &http.Client{Timeout: config.UpstreamTimeout}
	server := &Server{config: config, logger: logger, httpClient: client, mux: http.NewServeMux(), replays: NewReplayGuard()}
	server.hub = NewSessionHub(config, client, logger)
	server.routes()
	return server
}

func (server *Server) verifyServiceRequest(r *http.Request, body []byte) (string, error) {
	profile, err := VerifyServiceRequest(r, body, server.config.ServiceSecret, server.config.InstallationID, time.Now())
	if err != nil {
		return "", err
	}
	if !server.replays.Accept(r.Header.Get(serviceNonceHeader), time.Now()) {
		return "", errors.New("replayed service request")
	}
	return profile, nil
}

func (server *Server) Handler() http.Handler { return server.mux }

func (server *Server) Close() { server.hub.Close() }

func (server *Server) routes() {
	server.mux.HandleFunc("GET /healthz", server.health)
	server.mux.HandleFunc("GET /readyz", server.ready)
	server.mux.HandleFunc("GET /v1/capabilities", server.capabilities)
	server.mux.HandleFunc("GET /v1/preflight", server.preflight)
	server.mux.HandleFunc("/v1/runtime/", server.proxyRuntime)
	server.mux.HandleFunc("POST /v1/control/gateway", server.controlGateway)
	server.mux.HandleFunc("POST /v1/control/profile-test", server.testProfile)
	server.mux.HandleFunc("POST /v1/control/backup", server.controlBackup)
	server.mux.HandleFunc("POST /v1/control/upgrade", server.controlUpgrade)
	server.mux.HandleFunc("POST /v1/control/revoke", server.revokeTickets)
	server.mux.HandleFunc("GET /v1/ws", server.websocket)
	server.mux.HandleFunc("GET /{$}", server.websocket)
}

func (server *Server) revokeTickets(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, server.config.MaxRequestBodySize))
	if err != nil {
		http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
		return
	}
	if _, err := server.verifyServiceRequest(r, body); err != nil {
		http.Error(w, "invalid service authentication", http.StatusUnauthorized)
		return
	}
	var command struct {
		InstallationID string `json:"installationId"`
	}
	if json.Unmarshal(body, &command) != nil || command.InstallationID != server.config.InstallationID {
		http.Error(w, "invalid revocation", http.StatusBadRequest)
		return
	}
	server.ticketsRevokedBefore.Store(time.Now().UnixMilli())
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (server *Server) testProfile(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, server.config.MaxRequestBodySize))
	if err != nil {
		http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
		return
	}
	profile, err := server.verifyServiceRequest(r, body)
	if err != nil {
		http.Error(w, "invalid service authentication", http.StatusUnauthorized)
		return
	}
	var command struct {
		Profile string `json:"profile"`
	}
	if json.Unmarshal(body, &command) != nil || command.Profile != profile {
		http.Error(w, "invalid profile test", http.StatusBadRequest)
		return
	}
	if err := server.executeProfileTest(r.Context(), profile); err != nil {
		server.logger.Warn("Hermes profile test failed", "profile", profile, "error", err)
		writeJSON(w, http.StatusBadGateway, map[string]any{
			"ok": false, "category": "profile", "detail": "Hermes profile validation failed",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "profile": profile, "cleanup": true})
}

func (server *Server) executeProfileTest(ctx context.Context, profile string) error {
	upstreamURL := *server.config.RuntimeWSURL
	if server.config.RuntimeToken != "" {
		query := upstreamURL.Query()
		query.Set("token", server.config.RuntimeToken)
		upstreamURL.RawQuery = query.Encode()
	}
	headers := http.Header{}
	addRuntimeAuth(headers, server.config.RuntimeToken)
	connection, response, err := websocket.DefaultDialer.DialContext(ctx, upstreamURL.String(), headers)
	if response != nil && response.Body != nil {
		_ = response.Body.Close()
	}
	if err != nil {
		return fmt.Errorf("connect runtime websocket: %w", err)
	}
	defer connection.Close()
	deadline := time.Now().Add(server.config.UpstreamTimeout)
	_ = connection.SetWriteDeadline(deadline)
	_ = connection.SetReadDeadline(deadline)
	created, err := runtimeRPCCall(connection, 1, "session.create", map[string]any{
		"source":  "hermes-console-validation",
		"profile": profile,
	})
	if err != nil {
		return fmt.Errorf("create validation session: %w", err)
	}
	storedID, _ := created["stored_session_id"].(string)
	if storedID == "" {
		return errors.New("validation session did not return a stored id")
	}
	if _, err := runtimeRPCCall(connection, 2, "session.delete", map[string]any{
		"session_id": storedID,
		"profile":    profile,
	}); err != nil {
		return fmt.Errorf("cleanup validation session: %w", err)
	}
	return nil
}

func runtimeRPCCall(connection *websocket.Conn, id int, method string, params map[string]any) (map[string]any, error) {
	if err := connection.WriteJSON(map[string]any{
		"jsonrpc": "2.0", "id": id, "method": method, "params": params,
	}); err != nil {
		return nil, err
	}
	for {
		var response map[string]any
		if err := connection.ReadJSON(&response); err != nil {
			return nil, err
		}
		responseID, ok := response["id"].(float64)
		if !ok || int(responseID) != id {
			continue
		}
		if rpcError, ok := response["error"]; ok && rpcError != nil {
			return nil, fmt.Errorf("runtime RPC error: %v", rpcError)
		}
		result, ok := response["result"].(map[string]any)
		if !ok {
			return nil, errors.New("runtime RPC result is invalid")
		}
		return result, nil
	}
}

func (server *Server) controlGateway(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, server.config.MaxRequestBodySize))
	if err != nil {
		http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
		return
	}
	profile, err := server.verifyServiceRequest(r, body)
	if err != nil {
		http.Error(w, "invalid service authentication", http.StatusUnauthorized)
		return
	}
	var command struct {
		Action  string `json:"action"`
		Profile string `json:"profile"`
	}
	if json.Unmarshal(body, &command) != nil || command.Profile != profile || !containsString([]string{"start", "restart", "stop", "drain", "resume"}, command.Action) {
		http.Error(w, "invalid gateway control", http.StatusBadRequest)
		return
	}
	if err := server.executeGatewayControl(r.Context(), profile, command.Action); err != nil {
		server.logger.Error("Hermes gateway control failed", "profile", profile, "action", command.Action, "error", err)
		http.Error(w, "Hermes gateway control failed", http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "profile": profile, "action": command.Action})
}

func (server *Server) executeGatewayControl(ctx context.Context, profile, action string) error {
	if action == "drain" {
		server.draining.Store(true)
		return nil
	}
	if action == "resume" {
		server.draining.Store(false)
		return nil
	}
	switch server.config.ControlMode {
	case "dashboard":
		target := *server.config.RuntimeHTTPURL
		target.Path = "/api/gateway/" + action
		query := target.Query()
		query.Set("profile", profile)
		target.RawQuery = query.Encode()
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, target.String(), nil)
		if err != nil {
			return fmt.Errorf("create dashboard control request: %w", err)
		}
		addRuntimeAuth(request.Header, server.config.RuntimeToken)
		response, err := server.httpClient.Do(request)
		if err != nil {
			return fmt.Errorf("dashboard control request: %w", err)
		}
		defer response.Body.Close()
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			message, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
			return fmt.Errorf("dashboard control returned %d: %s", response.StatusCode, strings.TrimSpace(string(message)))
		}
		return nil
	case "cli":
		commandCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		output, err := exec.CommandContext(commandCtx, server.config.HermesCLI, "-p", profile, "gateway", action).CombinedOutput()
		if err != nil {
			return fmt.Errorf("Hermes CLI: %w: %s", err, strings.TrimSpace(string(output)))
		}
		return nil
	default:
		return fmt.Errorf("gateway lifecycle control is disabled")
	}
}

func (server *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "service": "hermes-gateway", "version": "1"})
}

func (server *Server) ready(w http.ResponseWriter, r *http.Request) {
	if server.draining.Load() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "runtime": "draining", "installationId": server.config.InstallationID})
		return
	}
	target := *server.config.RuntimeHTTPURL
	target.Path = "/api/status"
	request, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, target.String(), nil)
	addRuntimeAuth(request.Header, server.config.RuntimeToken)
	response, err := server.httpClient.Do(request)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "runtime": "offline"})
		return
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "runtime": "unhealthy", "status": response.StatusCode})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "runtime": "ready", "installationId": server.config.InstallationID})
}

func (server *Server) capabilities(w http.ResponseWriter, _ *http.Request) {
	lifecycle := []string{"drain", "resume"}
	if server.config.ControlMode == "dashboard" || server.config.ControlMode == "cli" {
		lifecycle = append(lifecycle, "start", "restart", "stop")
	}
	features := []string{"runtime.http", "runtime.websocket", "sessions.invalidate", "runtime.preflight", "runtime.profile-test", "tickets.revoke"}
	if server.config.BackupDirectory != "" && len(server.config.BackupEncryptionKey) >= 32 {
		features = append(features, "runtime.backup", "runtime.backup.verify")
		if server.config.BackupRestoreEnabled {
			features = append(features, "runtime.backup.restore")
		}
	}
	if server.config.UpgradeExecutable != "" && len(server.config.AllowedVersions) > 0 {
		features = append(features, "runtime.upgrade", "runtime.rollback")
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"protocolVersion": 1,
		"gatewayVersion":  "1",
		"installationId":  server.config.InstallationID,
		"mode":            "edge",
		"transport":       "direct",
		"runtimeKind":     server.config.RuntimeKind,
		"features":        features,
		"lifecycle":       lifecycle,
		"draining":        server.draining.Load(),
	})
}

type preflightProfile struct {
	Name           string  `json:"name"`
	Description    string  `json:"description,omitempty"`
	Provider       *string `json:"provider,omitempty"`
	Model          *string `json:"model,omitempty"`
	GatewayRunning bool    `json:"gatewayRunning"`
}

func (server *Server) preflight(w http.ResponseWriter, r *http.Request) {
	if _, err := server.verifyServiceRequest(r, nil); err != nil {
		http.Error(w, "invalid service authentication", http.StatusUnauthorized)
		return
	}
	var status map[string]any
	if err := server.fetchRuntimeJSON(r.Context(), "/api/status", &status); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"ok": false, "category": "runtime", "detail": "Hermes runtime unavailable",
		})
		return
	}
	var profileBody struct {
		Profiles []struct {
			Name           string  `json:"name"`
			Description    string  `json:"description"`
			Provider       *string `json:"provider"`
			Model          *string `json:"model"`
			GatewayRunning bool    `json:"gateway_running"`
		} `json:"profiles"`
	}
	if err := server.fetchRuntimeJSON(r.Context(), "/api/profiles", &profileBody); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{
			"ok": false, "category": "profiles", "detail": "Hermes profiles unavailable",
		})
		return
	}
	var system map[string]any
	_ = server.fetchRuntimeJSON(r.Context(), "/api/system/stats", &system)
	profiles := make([]preflightProfile, 0, len(profileBody.Profiles))
	for _, profile := range profileBody.Profiles {
		if !validProfile(profile.Name) {
			continue
		}
		profiles = append(profiles, preflightProfile{
			Name: profile.Name, Description: profile.Description, Provider: profile.Provider,
			Model: profile.Model, GatewayRunning: profile.GatewayRunning,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":              true,
		"protocolVersion": 1,
		"gatewayVersion":  "1",
		"installationId":  server.config.InstallationID,
		"runtimeKind":     server.config.RuntimeKind,
		"hermesVersion":   system["hermes_version"],
		"profiles":        profiles,
		"system":          safeSystemStats(system),
		"runtime": map[string]any{
			"gatewayRunning": status["gateway_running"],
			"gatewayState":   status["gateway_state"],
		},
	})
}

func (server *Server) fetchRuntimeJSON(ctx context.Context, path string, target any) error {
	endpoint := *server.config.RuntimeHTTPURL
	endpoint.Path = path
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return err
	}
	addRuntimeAuth(request.Header, server.config.RuntimeToken)
	response, err := server.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("runtime returned %d", response.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(response.Body, server.config.MaxRequestBodySize)).Decode(target)
}

func safeSystemStats(system map[string]any) map[string]any {
	result := map[string]any{}
	for _, key := range []string{"cpu_count", "cpu_percent", "memory", "disk", "uptime_seconds", "load_avg", "arch", "os"} {
		if value, ok := system[key]; ok {
			result[key] = value
		}
	}
	return result
}

func (server *Server) proxyRuntime(w http.ResponseWriter, r *http.Request) {
	path := "/" + strings.TrimPrefix(r.URL.Path, "/v1/runtime/")
	if !allowedRuntimeRoute(r.Method, path) {
		http.Error(w, "runtime route rejected", http.StatusForbidden)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, server.config.MaxRequestBodySize))
	if err != nil {
		http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
		return
	}
	profile, err := server.verifyServiceRequest(r, body)
	if err != nil {
		http.Error(w, "invalid service authentication", http.StatusUnauthorized)
		return
	}
	target := *server.config.RuntimeHTTPURL
	target.Path = path
	target.RawQuery = r.URL.RawQuery
	if len(body) > 0 && strings.Contains(r.Header.Get("Content-Type"), "application/json") {
		body, err = injectProfileJSON(body, profile)
		if err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
	} else {
		query := target.Query()
		query.Set("profile", profile)
		target.RawQuery = query.Encode()
	}
	request, err := http.NewRequestWithContext(r.Context(), r.Method, target.String(), bytes.NewReader(body))
	if err != nil {
		http.Error(w, "invalid upstream request", http.StatusBadRequest)
		return
	}
	request.Header.Set("Accept", "application/json")
	if len(body) > 0 {
		request.Header.Set("Content-Type", "application/json")
	}
	addRuntimeAuth(request.Header, server.config.RuntimeToken)
	response, err := server.httpClient.Do(request)
	if err != nil {
		http.Error(w, "Hermes runtime unavailable", http.StatusBadGateway)
		return
	}
	defer response.Body.Close()
	if path == "/api/status" && response.StatusCode >= 200 && response.StatusCode < 300 {
		payload, readErr := io.ReadAll(io.LimitReader(response.Body, server.config.MaxRequestBodySize))
		if readErr == nil {
			var status map[string]any
			if json.Unmarshal(payload, &status) == nil {
				server.enrichProfileStatus(profile, status)
				writeJSON(w, response.StatusCode, status)
				return
			}
			w.Header().Set("Content-Type", response.Header.Get("Content-Type"))
			w.WriteHeader(response.StatusCode)
			_, _ = w.Write(payload)
			return
		}
	}
	w.Header().Set("Content-Type", response.Header.Get("Content-Type"))
	w.WriteHeader(response.StatusCode)
	_, _ = io.Copy(w, response.Body)
}

func (server *Server) enrichProfileStatus(profile string, status map[string]any) {
	if !runtimeStatusServesProfile(status, profile) {
		if profile != "default" {
			status["gateway_running"] = false
			status["gateway_platforms"] = map[string]any{}
		}
		return
	}
	profileHome, err := profileDirectory(server.config.HermesHome, profile)
	if err != nil {
		return
	}
	contents, err := os.ReadFile(filepath.Join(profileHome, "gateway_state.json"))
	if err != nil {
		return
	}
	var stored struct {
		GatewayState string `json:"gateway_state"`
		Platforms    map[string]struct {
			State        string  `json:"state"`
			ErrorCode    *string `json:"error_code"`
			ErrorMessage *string `json:"error_message"`
			UpdatedAt    string  `json:"updated_at"`
		} `json:"platforms"`
	}
	if json.Unmarshal(contents, &stored) != nil {
		return
	}
	status["gateway_running"] = stored.GatewayState == "running"
	status["gateway_state"] = stored.GatewayState
	platforms := make(map[string]any, len(stored.Platforms))
	for name, platform := range stored.Platforms {
		platforms[name] = map[string]any{
			"state": platform.State, "error_code": platform.ErrorCode,
			"error_message": platform.ErrorMessage, "updated_at": platform.UpdatedAt,
		}
	}
	status["gateway_platforms"] = platforms
}

func runtimeStatusServesProfile(status map[string]any, profile string) bool {
	gateways, _ := status["gateways"].([]any)
	for _, value := range gateways {
		gateway, _ := value.(map[string]any)
		if gateway["profile"] == profile {
			return true
		}
		served, _ := gateway["served_profiles"].([]any)
		for _, candidate := range served {
			if candidate == profile {
				return true
			}
		}
	}
	return profile == "default" && status["gateway_running"] == true
}

func injectProfileJSON(body []byte, profile string) ([]byte, error) {
	var value map[string]any
	if err := json.Unmarshal(body, &value); err != nil {
		return nil, err
	}
	value["profile"] = profile
	return json.Marshal(value)
}

func (server *Server) websocket(w http.ResponseWriter, r *http.Request) {
	if server.draining.Load() {
		http.Error(w, "gateway is draining", http.StatusServiceUnavailable)
		return
	}
	origin := r.Header.Get("Origin")
	if origin != "" {
		if _, allowed := server.config.AllowedOrigins[origin]; !allowed {
			http.Error(w, "origin rejected", http.StatusForbidden)
			return
		}
	}
	ticket, err := VerifyTicket(r.URL.Query().Get("ticket"), server.config.TicketSecret, server.config.InstallationID, time.Now())
	if err != nil {
		http.Error(w, "invalid or expired ticket", http.StatusUnauthorized)
		return
	}
	if revokedBefore := server.ticketsRevokedBefore.Load(); revokedBefore > 0 && ticket.IssuedAt <= revokedBefore {
		http.Error(w, "revoked ticket", http.StatusUnauthorized)
		return
	}
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	client, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer client.Close()
	writer := &socketWriter{connection: client}
	_ = writer.JSON(bridgeStatus{Bridge: "status", Online: false, Detail: "Connexion au runtime Hermes…"})

	upstreamURL := *server.config.RuntimeWSURL
	if server.config.RuntimeToken != "" {
		query := upstreamURL.Query()
		query.Set("token", server.config.RuntimeToken)
		upstreamURL.RawQuery = query.Encode()
	}
	headers := http.Header{}
	addRuntimeAuth(headers, server.config.RuntimeToken)
	upstream, response, err := websocket.DefaultDialer.DialContext(r.Context(), upstreamURL.String(), headers)
	if response != nil && response.Body != nil {
		_ = response.Body.Close()
	}
	if err != nil {
		_ = writer.JSON(bridgeStatus{Bridge: "status", Online: false, Detail: "Runtime Hermes inaccessible."})
		_ = writer.Close(websocket.CloseTryAgainLater, "Hermes unavailable")
		return
	}
	defer upstream.Close()
	_ = writer.JSON(bridgeStatus{Bridge: "status", Online: true})

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	upstreamDone := make(chan error, 1)
	go func() {
		for {
			messageType, message, readErr := upstream.ReadMessage()
			if readErr != nil {
				upstreamDone <- readErr
				return
			}
			if writeErr := writer.Write(messageType, message); writeErr != nil {
				upstreamDone <- writeErr
				return
			}
		}
	}()

	unsubscribes := make(map[string]func())
	defer func() {
		for _, unsubscribe := range unsubscribes {
			unsubscribe()
		}
	}()
	clientMessages := make(chan []byte)
	clientErrors := make(chan error, 1)
	go func() {
		for {
			messageType, message, readErr := client.ReadMessage()
			if readErr != nil {
				clientErrors <- readErr
				return
			}
			if messageType != websocket.TextMessage {
				continue
			}
			select {
			case clientMessages <- message:
			case <-ctx.Done():
				return
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case <-upstreamDone:
			_ = writer.JSON(bridgeStatus{Bridge: "status", Online: false, Detail: "Connexion Hermes fermée."})
			_ = writer.Close(websocket.CloseInternalServerErr, "Hermes disconnected")
			return
		case <-clientErrors:
			return
		case message := <-clientMessages:
			control, isControl, controlErr := parseBridgeControl(message)
			if controlErr != nil {
				_ = writer.Close(websocket.CloseUnsupportedData, "invalid bridge control")
				return
			}
			if isControl {
				if control.Kind == "session.unsubscribe" {
					if unsubscribe := unsubscribes[control.SessionID]; unsubscribe != nil {
						unsubscribe()
						delete(unsubscribes, control.SessionID)
					}
				} else if unsubscribes[control.SessionID] == nil {
					unsubscribe, subscribeErr := server.hub.Subscribe(ticket.Profile, control.SessionID, func(event sessionInvalidation) {
						_ = writer.JSON(map[string]any{"__bridge__": "session.invalidated", "sessionId": event.SessionID, "cursor": event.Cursor, "reason": event.Reason})
					})
					if subscribeErr != nil {
						_ = writer.Close(websocket.ClosePolicyViolation, "invalid subscription")
						return
					}
					unsubscribes[control.SessionID] = unsubscribe
				}
				continue
			}
			frame, forward, scopeErr := scopeRPC(message, ticket)
			if scopeErr != nil {
				_ = writer.Close(websocket.CloseUnsupportedData, "invalid JSON-RPC")
				return
			}
			if !forward {
				_ = writer.Write(websocket.TextMessage, frame)
				continue
			}
			if err := upstream.WriteMessage(websocket.TextMessage, frame); err != nil {
				return
			}
		}
	}
}

type bridgeStatus struct {
	Bridge string `json:"__bridge__"`
	Online bool   `json:"online"`
	PID    *int   `json:"pid"`
	Detail string `json:"detail,omitempty"`
}

type bridgeControl struct {
	Kind      string
	SessionID string
}

func parseBridgeControl(raw []byte) (bridgeControl, bool, error) {
	var frame struct {
		Bridge    string `json:"__bridge__"`
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(raw, &frame); err != nil {
		return bridgeControl{}, false, nil
	}
	if frame.Bridge != "session.subscribe" && frame.Bridge != "session.unsubscribe" {
		return bridgeControl{}, false, nil
	}
	if frame.SessionID == "" || len(frame.SessionID) > 256 {
		return bridgeControl{}, true, errors.New("invalid session")
	}
	return bridgeControl{Kind: frame.Bridge, SessionID: frame.SessionID}, true, nil
}

type socketWriter struct {
	mu         sync.Mutex
	connection *websocket.Conn
}

func (writer *socketWriter) Write(messageType int, payload []byte) error {
	writer.mu.Lock()
	defer writer.mu.Unlock()
	return writer.connection.WriteMessage(messageType, payload)
}

func (writer *socketWriter) JSON(value any) error {
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return writer.Write(websocket.TextMessage, payload)
}

func (writer *socketWriter) Close(code int, reason string) error {
	writer.mu.Lock()
	defer writer.mu.Unlock()
	return writer.connection.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(code, reason), time.Now().Add(time.Second))
}

func addRuntimeAuth(headers http.Header, token string) {
	if token == "" {
		return
	}
	headers.Set("X-Hermes-Session-Token", token)
	headers.Set("Authorization", "Bearer "+token)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func runtimeURL(base *url.URL, path string) string {
	target := *base
	target.Path = path
	return target.String()
}

var _ = fmt.Sprintf
