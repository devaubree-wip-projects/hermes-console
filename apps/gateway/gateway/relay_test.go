package gateway

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func testClientCertificate(t *testing.T, commonName string) (tls.Certificate, []byte) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()), Subject: pkix.Name{CommonName: commonName},
		NotBefore: time.Now().Add(-time.Minute), NotAfter: time.Now().Add(time.Hour),
		KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}
	raw, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	encodedKey, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	certificate, err := tls.X509KeyPair(
		pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: raw}),
		pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: encodedKey}),
	)
	if err != nil {
		t.Fatal(err)
	}
	return certificate, raw
}

func testRelayCredential(t *testing.T, secret string, rawCertificate []byte, installationID string) string {
	t.Helper()
	fingerprint := sha256.Sum256(rawCertificate)
	identity := RelayIdentity{
		Version: 1, TenantID: "tenant-a", InstallationID: installationID,
		InstallationKey: "edge-a", Fingerprint: hex.EncodeToString(fingerprint[:]),
		ExpiresAt: time.Now().Add(time.Hour).UnixMilli(),
	}
	payloadBytes, err := json.Marshal(identity)
	if err != nil {
		t.Fatal(err)
	}
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	return payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func relayTestServer(t *testing.T, relay *Relay) (*httptest.Server, *tls.Config) {
	t.Helper()
	server := httptest.NewUnstartedServer(relay.Handler())
	server.TLS = &tls.Config{MinVersion: tls.VersionTLS13, ClientAuth: tls.RequestClientCert}
	server.StartTLS()
	t.Cleanup(server.Close)
	pool := x509.NewCertPool()
	pool.AddCert(server.Certificate())
	return server, &tls.Config{MinVersion: tls.VersionTLS13, RootCAs: pool}
}

func TestRelayRequiresMTLSAndMultiplexesHTTPAndWebSocket(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	edgeMux := http.NewServeMux()
	edgeMux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "edge": "a"})
	})
	edgeMux.HandleFunc("GET /v1/ws", func(w http.ResponseWriter, r *http.Request) {
		connection, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer connection.Close()
		messageType, body, err := connection.ReadMessage()
		if err == nil {
			_ = connection.WriteMessage(messageType, append([]byte("edge:"), body...))
		}
	})
	edgeServer := httptest.NewServer(edgeMux)
	defer edgeServer.Close()
	edgeURL, _ := url.Parse(edgeServer.URL)

	secret := "relay-identity-secret-at-least-24"
	config := Config{
		RelayIdentitySecret: secret, ServiceSecret: "relay-service-secret-at-least-24",
		RelayMaxConnections: 10, RelayMaxFrameBytes: 1 << 20, MaxRequestBodySize: 1 << 20,
		RelayRevocationFile: filepath.Join(t.TempDir(), "revocations.json"),
	}
	relay := NewRelay(config, slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer relay.Close()
	relayServer, relayTLS := relayTestServer(t, relay)
	clientCertificate, rawCertificate := testClientCertificate(t, "edge-a")
	credential := testRelayCredential(t, secret, rawCertificate, "installation-a")
	relayURL, _ := url.Parse("wss" + relayServer.URL[len("https"):] + "/v1/relay/connect")
	edgeConfig := config
	edgeConfig.RelayURL = relayURL
	edgeConfig.RelayCredential = credential
	edgeConfig.EdgeLocalURL = edgeURL
	edgeTLS := relayTLS.Clone()
	edgeTLS.Certificates = []tls.Certificate{clientCertificate}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	connected := make(chan error, 1)
	go func() {
		connected <- runEdgeRelayConnection(ctx, edgeConfig, slog.New(slog.NewTextHandler(io.Discard, nil)), edgeTLS)
	}()

	deadline := time.Now().Add(3 * time.Second)
	for relay.peer("installation-a") == nil && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if relay.peer("installation-a") == nil {
		t.Fatal("edge did not connect")
	}
	metricsResponse, err := relayServer.Client().Get(relayServer.URL + "/metrics")
	if err != nil {
		t.Fatal(err)
	}
	metricsBody, _ := io.ReadAll(metricsResponse.Body)
	_ = metricsResponse.Body.Close()
	if !strings.Contains(string(metricsBody), "hermes_relay_connected_edges 1") || strings.Contains(string(metricsBody), "tenant-a") {
		t.Fatalf("Relay metrics missing counts or leaking tenant identity: %s", metricsBody)
	}

	response, err := relayServer.Client().Get(relayServer.URL + "/v1/relay/installations/installation-a/healthz")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(response.Body)
	_ = response.Body.Close()
	if response.StatusCode != http.StatusOK || string(body) != "{\"edge\":\"a\",\"ok\":true}\n" {
		t.Fatalf("unexpected HTTP proxy response %d %s", response.StatusCode, body)
	}

	isolated, err := relayServer.Client().Get(relayServer.URL + "/v1/relay/installations/installation-b/healthz")
	if err != nil {
		t.Fatal(err)
	}
	_ = isolated.Body.Close()
	if isolated.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("other installation was routed: %d", isolated.StatusCode)
	}

	websocketURL := "wss" + relayServer.URL[len("https"):] + "/v1/relay/installations/installation-a/v1/ws"
	websocketClient, response, err := (&websocket.Dialer{TLSClientConfig: relayTLS}).Dial(websocketURL, nil)
	if response != nil && response.Body != nil {
		_ = response.Body.Close()
	}
	if err != nil {
		t.Fatal(err)
	}
	defer websocketClient.Close()
	if err := websocketClient.WriteMessage(websocket.TextMessage, []byte("hello")); err != nil {
		t.Fatal(err)
	}
	_, echoed, err := websocketClient.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}
	if string(echoed) != "edge:hello" {
		t.Fatalf("unexpected websocket payload %q", echoed)
	}

	noCertificateDialer := websocket.Dialer{TLSClientConfig: relayTLS}
	_, unauthorized, err := noCertificateDialer.Dial(relayURL.String(), http.Header{"Authorization": []string{"Bearer " + credential}})
	if err == nil {
		t.Fatal("relay accepted an Edge without mTLS certificate")
	}
	if unauthorized == nil || unauthorized.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %#v", unauthorized)
	}

	revokedDigest := sha256.Sum256(rawCertificate)
	revokedFingerprint := hex.EncodeToString(revokedDigest[:])
	revocationBody := []byte(`{"installationId":"installation-a","fingerprints":["` + revokedFingerprint + `"]}`)
	timestamp := time.Now().UnixMilli()
	revocationRequest, _ := http.NewRequest(http.MethodPost, relayServer.URL+"/v1/relay/admin/revoke", bytes.NewReader(revocationBody))
	revocationRequest.Header.Set(serviceTimestampHeader, fmt.Sprint(timestamp))
	nonce := "0123456789abcdef0123456789abcdef"
	revocationRequest.Header.Set(serviceNonceHeader, nonce)
	revocationRequest.Header.Set(serviceSignatureHeader, ServiceSignature(config.ServiceSecret, http.MethodPost, "/v1/relay/admin/revoke", timestamp, nonce, "default", revocationBody))
	revocationRequest.Header.Set(serviceProfileHeader, "default")
	revocationRequest.Header.Set(serviceInstallationHeader, "edge-a")
	revocationResponse, err := relayServer.Client().Do(revocationRequest)
	if err != nil {
		t.Fatal(err)
	}
	_ = revocationResponse.Body.Close()
	if revocationResponse.StatusCode != http.StatusOK {
		t.Fatalf("revocation failed: %d", revocationResponse.StatusCode)
	}
	deadline = time.Now().Add(time.Second)
	for relay.peer("installation-a") != nil && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if relay.peer("installation-a") != nil {
		t.Fatal("revocation did not close the active tunnel")
	}

	_, revokedResponse, err := (&websocket.Dialer{TLSClientConfig: edgeTLS}).Dial(relayURL.String(), http.Header{"Authorization": []string{"Bearer " + credential}})
	if err == nil {
		t.Fatal("revoked certificate reconnected")
	}
	if revokedResponse == nil || revokedResponse.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected revoked 401, got %#v", revokedResponse)
	}
	reloaded := NewRelay(config, slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer reloaded.Close()
	if !reloaded.isRevoked(revokedFingerprint, time.Now()) {
		t.Fatal("revocation was not persisted")
	}
}

func TestRelayIdentityRejectsCertificateSubstitution(t *testing.T) {
	secret := "relay-identity-secret-at-least-24"
	_, rawA := testClientCertificate(t, "edge-a")
	_, rawB := testClientCertificate(t, "edge-b")
	credential := testRelayCredential(t, secret, rawA, "installation-a")
	if _, err := VerifyRelayIdentity(credential, secret, rawB, time.Now()); err == nil {
		t.Fatal("credential was not bound to its enrolled certificate")
	}
}

func TestRelayClientReconnectsAfterNetworkCut(t *testing.T) {
	edgeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, http.StatusOK, map[string]any{"ok": true}) }))
	defer edgeServer.Close()
	edgeURL, _ := url.Parse(edgeServer.URL)
	secret := "relay-identity-secret-at-least-24"
	config := Config{RelayIdentitySecret: secret, ServiceSecret: testSecret, RelayMaxConnections: 10, RelayMaxConnectionsPerTenant: 10, RelayMaxFrameBytes: 1 << 20, MaxRequestBodySize: 1 << 20}
	relay := NewRelay(config, slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer relay.Close()
	relayServer, relayTLS := relayTestServer(t, relay)
	clientCertificate, rawCertificate := testClientCertificate(t, "edge-reconnect")
	relayURL, _ := url.Parse("wss" + relayServer.URL[len("https"):] + "/v1/relay/connect")
	config.RelayURL = relayURL
	config.RelayCredential = testRelayCredential(t, secret, rawCertificate, "installation-reconnect")
	config.EdgeLocalURL = edgeURL
	config.InstallationID = "edge-a"
	edgeTLS := relayTLS.Clone()
	edgeTLS.Certificates = []tls.Certificate{clientCertificate}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() { _ = runEdgeRelayLoop(ctx, config, slog.New(slog.NewTextHandler(io.Discard, nil)), edgeTLS) }()
	deadline := time.Now().Add(3 * time.Second)
	for relay.peer("installation-reconnect") == nil && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	first := relay.peer("installation-reconnect")
	if first == nil {
		t.Fatal("initial Relay connection missing")
	}
	first.close()
	deadline = time.Now().Add(4 * time.Second)
	for (relay.connectedTotal.Load() < 2 || relay.peer("installation-reconnect") == nil || relay.peer("installation-reconnect") == first) && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if relay.connectedTotal.Load() < 2 || relay.peer("installation-reconnect") == nil || relay.peer("installation-reconnect") == first {
		t.Fatal("Edge did not reconnect after tunnel cut")
	}
}

func TestRelayEnforcesPerTenantConnectionQuota(t *testing.T) {
	secret := "relay-identity-secret-at-least-24"
	config := Config{RelayIdentitySecret: secret, RelayMaxConnections: 10, RelayMaxConnectionsPerTenant: 1, RelayMaxFrameBytes: 1 << 20}
	relay := NewRelay(config, slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer relay.Close()
	server, baseTLS := relayTestServer(t, relay)
	relayURL := "wss" + server.URL[len("https"):] + "/v1/relay/connect"
	certificateA, rawA := testClientCertificate(t, "edge-a")
	tlsA := baseTLS.Clone()
	tlsA.Certificates = []tls.Certificate{certificateA}
	first, response, err := (&websocket.Dialer{TLSClientConfig: tlsA}).Dial(relayURL, http.Header{"Authorization": []string{"Bearer " + testRelayCredential(t, secret, rawA, "quota-a")}})
	if response != nil && response.Body != nil {
		_ = response.Body.Close()
	}
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	deadline := time.Now().Add(time.Second)
	for relay.peer("quota-a") == nil && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	certificateB, rawB := testClientCertificate(t, "edge-b")
	tlsB := baseTLS.Clone()
	tlsB.Certificates = []tls.Certificate{certificateB}
	_, rejected, err := (&websocket.Dialer{TLSClientConfig: tlsB}).Dial(relayURL, http.Header{"Authorization": []string{"Bearer " + testRelayCredential(t, secret, rawB, "quota-b")}})
	if err == nil {
		t.Fatal("per-tenant Relay quota was bypassed")
	}
	if rejected == nil || rejected.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("expected quota 503, got %#v", rejected)
	}
}
