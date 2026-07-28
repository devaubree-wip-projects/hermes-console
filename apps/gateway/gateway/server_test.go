package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func testConfig(t *testing.T, runtimeURL string) Config {
	t.Helper()
	httpURL, err := url.Parse(runtimeURL)
	if err != nil {
		t.Fatal(err)
	}
	wsURL := *httpURL
	wsURL.Scheme = "ws"
	wsURL.Path = "/api/ws"
	return Config{
		ListenAddress: "127.0.0.1:0", RuntimeHTTPURL: httpURL, RuntimeWSURL: &wsURL,
		RuntimeToken: "runtime-secret", TicketSecret: testSecret, ServiceSecret: testSecret,
		InstallationID: "install-1", AllowedOrigins: map[string]struct{}{"http://localhost:3010": {}},
		HermesHome: t.TempDir(), SessionDebounce: time.Millisecond, UpstreamTimeout: time.Second,
		MaxRequestBodySize: 1 << 20,
	}
}

func TestWebSocketScopesProfileBeforeForwarding(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	observed := make(chan rpcRequest, 1)
	runtime := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/ws" {
			http.NotFound(w, r)
			return
		}
		connection, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer connection.Close()
		_, message, err := connection.ReadMessage()
		if err != nil {
			return
		}
		var request rpcRequest
		_ = json.Unmarshal(message, &request)
		observed <- request
		_ = connection.WriteJSON(map[string]any{"jsonrpc": "2.0", "id": request.ID, "result": map[string]any{"ok": true}})
	}))
	defer runtime.Close()

	config := testConfig(t, runtime.URL)
	application := NewServer(config, slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer application.Close()
	server := httptest.NewServer(application.Handler())
	defer server.Close()

	now := time.Now()
	ticket := makeTicket(t, Ticket{
		Version: 1, AgentID: "agent-1", InstallationID: "install-1",
		Profile: "allowed-profile", Role: "member", IssuedAt: now.UnixMilli(), ExpiresAt: now.Add(time.Minute).UnixMilli(),
	}, testSecret)
	websocketURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/v1/ws?ticket=" + url.QueryEscape(ticket)
	headers := http.Header{"Origin": {"http://localhost:3010"}}
	client, _, err := websocket.DefaultDialer.Dial(websocketURL, headers)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	for range 2 {
		if _, _, err := client.ReadMessage(); err != nil {
			t.Fatal(err)
		}
	}
	if err := client.WriteJSON(map[string]any{
		"jsonrpc": "2.0", "id": 1, "method": "session.list",
		"params": map[string]any{"profile": "attacker"},
	}); err != nil {
		t.Fatal(err)
	}
	select {
	case request := <-observed:
		if request.Params["profile"] != "allowed-profile" {
			t.Fatalf("profile not forced: %#v", request.Params)
		}
	case <-time.After(time.Second):
		t.Fatal("upstream request timed out")
	}
	_, response, err := client.ReadMessage()
	if err != nil || !strings.Contains(string(response), `"ok":true`) {
		t.Fatalf("unexpected upstream response %s, error=%v", response, err)
	}
}

func signedRequest(t *testing.T, method, target, profile string, body []byte) *http.Request {
	t.Helper()
	request := httptest.NewRequest(method, target, strings.NewReader(string(body)))
	timestamp := time.Now().UnixMilli()
	request.Header.Set(serviceTimestampHeader, strconv.FormatInt(timestamp, 10))
	request.Header.Set(serviceProfileHeader, profile)
	request.Header.Set(serviceInstallationHeader, "install-1")
	nonce := fmt.Sprintf("%032x", time.Now().UnixNano())
	request.Header.Set(serviceNonceHeader, nonce)
	request.Header.Set(serviceSignatureHeader, ServiceSignature(testSecret, method, request.URL.RequestURI(), timestamp, nonce, profile, body))
	if len(body) > 0 {
		request.Header.Set("Content-Type", "application/json")
	}
	return request
}

func TestRuntimeProxyAuthenticatesAllowlistsAndForcesProfile(t *testing.T) {
	type observedRequest struct {
		path, query, authorization, sessionToken string
		body                                     map[string]any
	}
	observed := make(chan observedRequest, 1)
	runtime := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		observed <- observedRequest{r.URL.Path, r.URL.RawQuery, r.Header.Get("Authorization"), r.Header.Get("X-Hermes-Session-Token"), body}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer runtime.Close()
	server := NewServer(testConfig(t, runtime.URL), slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer server.Close()

	body := []byte(`{"profile":"attacker","theme":"dark"}`)
	request := signedRequest(t, http.MethodPut, "http://gateway/v1/runtime/api/config", "allowed", body)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", response.Code, response.Body.String())
	}
	got := <-observed
	if got.path != "/api/config" || got.body["profile"] != "allowed" || got.authorization != "Bearer runtime-secret" || got.sessionToken != "runtime-secret" {
		t.Fatalf("unexpected upstream request: %#v", got)
	}

	rejected := httptest.NewRecorder()
	server.Handler().ServeHTTP(rejected, signedRequest(t, http.MethodGet, "http://gateway/v1/runtime/api/internal/secrets", "allowed", nil))
	if rejected.Code != http.StatusForbidden {
		t.Fatalf("expected allowlist rejection, got %d", rejected.Code)
	}

	unauthorized := httptest.NewRecorder()
	server.Handler().ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "http://gateway/v1/runtime/api/status", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("expected auth rejection, got %d", unauthorized.Code)
	}
}

func TestRuntimeProxyForcesProfileOnMcpWrites(t *testing.T) {
	type observed struct {
		path, query string
		body        map[string]any
	}
	seen := make(chan observed, 2)
	runtime := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		seen <- observed{r.URL.Path, r.URL.RawQuery, body}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer runtime.Close()
	server := NewServer(testConfig(t, runtime.URL), slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer server.Close()

	// An MCP server name is attacker-influenced text in the URL; the profile it
	// lands on must come from the ticket, never from the caller's body.
	create := []byte(`{"profile":"attacker","name":"evil","command":"/bin/sh"}`)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, signedRequest(t, http.MethodPost, "http://gateway/v1/runtime/api/mcp/servers", "allowed", create))
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", response.Code, response.Body.String())
	}
	if got := <-seen; got.path != "/api/mcp/servers" || got.body["profile"] != "allowed" {
		t.Fatalf("expected the ticket profile to win, got %#v", got)
	}

	// The runtime reads the profile from the query on this route, so a caller
	// supplied `?profile=` must never survive — even when a JSON body is present
	// and body injection has already run.
	removal := httptest.NewRecorder()
	server.Handler().ServeHTTP(removal, signedRequest(t, http.MethodDelete, "http://gateway/v1/runtime/api/mcp/servers/evil?profile=victim", "allowed", []byte(`{"profile":"victim"}`)))
	if removal.Code != http.StatusOK {
		t.Fatalf("unexpected delete status %d: %s", removal.Code, removal.Body.String())
	}
	got := <-seen
	if got.path != "/api/mcp/servers/evil" || got.query != "profile=allowed" {
		t.Fatalf("expected the delete to carry the ticket profile, got %#v", got)
	}
	if got.body["profile"] != "allowed" {
		t.Fatalf("expected the body profile to be overwritten too, got %#v", got.body)
	}

	// Replacing the whole map stays out of reach.
	replace := httptest.NewRecorder()
	server.Handler().ServeHTTP(replace, signedRequest(t, http.MethodPut, "http://gateway/v1/runtime/api/mcp/servers", "allowed", []byte(`{"servers":{}}`)))
	if replace.Code != http.StatusForbidden {
		t.Fatalf("expected the whole-map replace to be rejected, got %d", replace.Code)
	}
}

func TestRuntimeProxyRejectsCrossProfilePathWrites(t *testing.T) {
	reached := make(chan string, 2)
	runtime := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached <- r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer runtime.Close()
	server := NewServer(testConfig(t, runtime.URL), slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer server.Close()

	// The profile lives in the URL here, so body injection cannot scope it: the
	// ticket must be what decides, or a ticket for `allowed` rewrites the system
	// prompt of any other agent on the installation.
	body := []byte(`{"content":"# pwned"}`)
	rejected := httptest.NewRecorder()
	server.Handler().ServeHTTP(rejected, signedRequest(t, http.MethodPut, "http://gateway/v1/runtime/api/profiles/victim/soul", "allowed", body))
	if rejected.Code != http.StatusForbidden {
		t.Fatalf("expected a cross-profile write to be rejected, got %d", rejected.Code)
	}
	select {
	case path := <-reached:
		t.Fatalf("cross-profile write reached the runtime at %s", path)
	default:
	}

	accepted := httptest.NewRecorder()
	server.Handler().ServeHTTP(accepted, signedRequest(t, http.MethodPut, "http://gateway/v1/runtime/api/profiles/allowed/soul", "allowed", body))
	if accepted.Code != http.StatusOK {
		t.Fatalf("expected the ticket's own profile to be writable, got %d: %s", accepted.Code, accepted.Body.String())
	}
	if path := <-reached; path != "/api/profiles/allowed/soul" {
		t.Fatalf("unexpected upstream path %q", path)
	}
}

func TestRuntimeStatusUsesTheServedProfilesGatewayState(t *testing.T) {
	home := t.TempDir()
	profileHome := filepath.Join(home, "profiles", "assistant-principal")
	if err := os.MkdirAll(profileHome, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(profileHome, "gateway_state.json"), []byte(`{
		"gateway_state":"running",
		"platforms":{"telegram":{"state":"connected","error_code":null,"error_message":null,"updated_at":"2026-07-15T16:24:23Z"}}
	}`), 0o600); err != nil {
		t.Fatal(err)
	}
	runtime := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"gateway_running": true,
			"gateways":        []map[string]any{{"profile": "default"}, {"profile": "assistant-principal"}},
		})
	}))
	defer runtime.Close()
	config := testConfig(t, runtime.URL)
	config.HermesHome = home
	server := NewServer(config, slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer server.Close()

	request := signedRequest(t, http.MethodGet, "http://gateway/v1/runtime/api/status?profile=assistant-principal", "assistant-principal", nil)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", response.Code, response.Body.String())
	}
	var payload struct {
		GatewayRunning   bool `json:"gateway_running"`
		GatewayPlatforms map[string]struct {
			State string `json:"state"`
		} `json:"gateway_platforms"`
	}
	if json.Unmarshal(response.Body.Bytes(), &payload) != nil || !payload.GatewayRunning || payload.GatewayPlatforms["telegram"].State != "connected" {
		t.Fatalf("profile status was not enriched: %s", response.Body.String())
	}
}

func TestHealthReadyAndCapabilities(t *testing.T) {
	runtime := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/status" {
			t.Fatalf("unexpected runtime path %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer runtime.Close()
	server := NewServer(testConfig(t, runtime.URL), slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer server.Close()

	for _, path := range []string{"/healthz", "/readyz", "/v1/capabilities"} {
		response := httptest.NewRecorder()
		server.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusOK {
			t.Fatalf("%s returned %d: %s", path, response.Code, response.Body.String())
		}
	}
}

func TestTelegramWorkAuthenticatesLocallyAndForwardsSignedCommand(t *testing.T) {
	runtime := httptest.NewServer(http.NotFoundHandler())
	defer runtime.Close()

	type observedCommand struct {
		Profile            string `json:"profile"`
		Title              string `json:"title"`
		TelegramUserID     string `json:"telegramUserId"`
		TelegramChatID     string `json:"telegramChatId"`
		TelegramMessageID  string `json:"telegramMessageId"`
		TelegramUpdateID   int64  `json:"telegramUpdateId"`
		InstallationRecord string `json:"installationId"`
	}
	observed := make(chan observedCommand, 1)
	control := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		if r.URL.Path != "/api/runtime/work/telegram" {
			t.Errorf("unexpected control-plane path %s", r.URL.Path)
		}
		if _, err := VerifyServiceRequest(r, body, testSecret, "install-1", time.Now()); err != nil {
			t.Errorf("invalid forwarded signature: %v", err)
		}
		var command observedCommand
		if err := json.Unmarshal(body, &command); err != nil {
			t.Errorf("invalid forwarded payload: %v", err)
		}
		observed <- command
		writeJSON(w, http.StatusCreated, map[string]any{
			"ok":   true,
			"item": map[string]any{"id": "item-1", "key": "WORK-7"},
			"run":  map[string]any{"id": "run-1"},
		})
	}))
	defer control.Close()
	controlURL, err := url.Parse(control.URL)
	if err != nil {
		t.Fatal(err)
	}

	config := testConfig(t, runtime.URL)
	config.WorkEnabled = true
	config.WorkControlPlaneURL = controlURL
	config.WorkInstallationID = "00000000-0000-4000-8000-000000000010"
	application := NewServer(config, slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer application.Close()

	payload := `{"profile":"tenant-agent","title":"Corriger la pagination","description":"Ajouter le test.","telegramUserId":"42","telegramChatId":"100","telegramMessageId":"77","telegramUpdateId":88}`
	unauthorized := httptest.NewRecorder()
	application.Handler().ServeHTTP(
		unauthorized,
		httptest.NewRequest(http.MethodPost, "http://gateway/v1/work/telegram", strings.NewReader(payload)),
	)
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("expected local auth rejection, got %d: %s", unauthorized.Code, unauthorized.Body.String())
	}

	request := httptest.NewRequest(http.MethodPost, "http://gateway/v1/work/telegram", strings.NewReader(payload))
	request.Header.Set("X-Hermes-Session-Token", "runtime-secret")
	response := httptest.NewRecorder()
	application.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusCreated || !strings.Contains(response.Body.String(), `"key":"WORK-7"`) {
		t.Fatalf("unexpected Telegram Work response %d: %s", response.Code, response.Body.String())
	}
	got := <-observed
	if got.Profile != "tenant-agent" || got.Title != "Corriger la pagination" ||
		got.TelegramUserID != "42" || got.TelegramChatID != "100" ||
		got.TelegramMessageID != "77" || got.TelegramUpdateID != 88 ||
		got.InstallationRecord != config.WorkInstallationID {
		t.Fatalf("unexpected forwarded command: %#v", got)
	}
}

func TestTelegramAgentForwardsCreationAndRejectsMalformedCommands(t *testing.T) {
	runtime := httptest.NewServer(http.NotFoundHandler())
	defer runtime.Close()

	type observedCommand struct {
		Profile            string  `json:"profile"`
		Name               *string `json:"name"`
		Mission            *string `json:"mission"`
		TelegramUserID     string  `json:"telegramUserId"`
		InstallationRecord string  `json:"installationId"`
	}
	observed := make(chan observedCommand, 2)
	control := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		if r.URL.Path != "/api/runtime/agents/create" {
			t.Errorf("unexpected control-plane path %s", r.URL.Path)
		}
		if _, err := VerifyServiceRequest(r, body, testSecret, "install-1", time.Now()); err != nil {
			t.Errorf("invalid forwarded signature: %v", err)
		}
		var command observedCommand
		if err := json.Unmarshal(body, &command); err != nil {
			t.Errorf("invalid forwarded payload: %v", err)
		}
		observed <- command
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "name": "Prospect B2B", "runtimeState": "ready"})
	}))
	defer control.Close()
	controlURL, err := url.Parse(control.URL)
	if err != nil {
		t.Fatal(err)
	}

	config := testConfig(t, runtime.URL)
	config.WorkEnabled = true
	config.WorkControlPlaneURL = controlURL
	config.WorkInstallationID = "00000000-0000-4000-8000-000000000010"
	application := NewServer(config, slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer application.Close()

	send := func(payload string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPost, "http://gateway/v1/agents/create/telegram", strings.NewReader(payload))
		request.Header.Set("X-Hermes-Session-Token", "runtime-secret")
		response := httptest.NewRecorder()
		application.Handler().ServeHTTP(response, request)
		return response
	}

	unauthorized := httptest.NewRecorder()
	application.Handler().ServeHTTP(unauthorized, httptest.NewRequest(
		http.MethodPost,
		"http://gateway/v1/agents/create/telegram",
		strings.NewReader(`{"profile":"tenant-agent","telegramUserId":"42","telegramChatId":"100"}`),
	))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("expected local auth rejection, got %d: %s", unauthorized.Code, unauthorized.Body.String())
	}

	created := send(`{"profile":"tenant-agent","name":"Prospect B2B","mission":"Qualifier les TPE.","telegramUserId":"42","telegramChatId":"100"}`)
	if created.Code != http.StatusCreated {
		t.Fatalf("unexpected creation status %d: %s", created.Code, created.Body.String())
	}
	got := <-observed
	if got.Profile != "tenant-agent" || got.Name == nil || *got.Name != "Prospect B2B" ||
		got.Mission == nil || *got.Mission != "Qualifier les TPE." ||
		got.TelegramUserID != "42" || got.InstallationRecord != config.WorkInstallationID {
		t.Fatalf("unexpected forwarded command: %#v", got)
	}

	// A bare `/agent` lists: no name must reach the Console, and the status must
	// not claim a creation happened.
	listed := send(`{"profile":"tenant-agent","telegramUserId":"42","telegramChatId":"100"}`)
	if listed.Code != http.StatusOK {
		t.Fatalf("unexpected list status %d: %s", listed.Code, listed.Body.String())
	}
	if got := <-observed; got.Name != nil {
		t.Fatalf("a listing must not carry a name: %#v", got)
	}

	// A mission without a name would silently create nothing.
	if rejected := send(`{"profile":"tenant-agent","mission":"Sans nom","telegramUserId":"42","telegramChatId":"100"}`); rejected.Code != http.StatusBadRequest {
		t.Fatalf("expected a mission without a name to be rejected, got %d", rejected.Code)
	}
	if rejected := send(`{"profile":"tenant-agent","name":"   ","telegramUserId":"42","telegramChatId":"100"}`); rejected.Code != http.StatusBadRequest {
		t.Fatalf("expected a blank name to be rejected, got %d", rejected.Code)
	}
	if rejected := send(`{"profile":"../escape","name":"Prospect","telegramUserId":"42","telegramChatId":"100"}`); rejected.Code != http.StatusBadRequest {
		t.Fatalf("expected an invalid profile to be rejected, got %d", rejected.Code)
	}
}

func TestPreflightDiscoversRuntimeWithoutLeakingProfilePaths(t *testing.T) {
	runtime := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer runtime-secret" {
			t.Fatalf("missing runtime authentication on %s", r.URL.Path)
		}
		switch r.URL.Path {
		case "/api/status":
			writeJSON(w, http.StatusOK, map[string]any{"gateway_running": true, "gateway_state": "running"})
		case "/api/profiles":
			writeJSON(w, http.StatusOK, map[string]any{"profiles": []map[string]any{
				{"name": "default", "path": "/secret/runtime/path", "provider": "openai", "model": "gpt-test", "gateway_running": true},
				{"name": "../unsafe", "path": "/must/not/leak"},
			}})
		case "/api/system/stats":
			writeJSON(w, http.StatusOK, map[string]any{
				"hermes_version": "2026.7.7.2", "cpu_count": 4, "hostname": "private-host",
				"memory": map[string]any{"total": 1024, "used": 256},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer runtime.Close()
	config := testConfig(t, runtime.URL)
	config.RuntimeKind = "docker"
	server := NewServer(config, slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer server.Close()
	request := signedRequest(t, http.MethodGet, "http://gateway/v1/preflight", "default", nil)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", response.Code, response.Body.String())
	}
	body := response.Body.String()
	if !strings.Contains(body, `"hermesVersion":"2026.7.7.2"`) || !strings.Contains(body, `"runtimeKind":"docker"`) {
		t.Fatalf("preflight metadata missing: %s", body)
	}
	if !strings.Contains(body, `"name":"default"`) || strings.Contains(body, "../unsafe") || strings.Contains(body, "/secret/") || strings.Contains(body, "private-host") {
		t.Fatalf("preflight leaked or accepted unsafe data: %s", body)
	}

	unauthorized := httptest.NewRecorder()
	server.Handler().ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v1/preflight", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("expected authenticated preflight, got %d", unauthorized.Code)
	}
}

func TestGatewayControlUsesAuthenticatedDashboardLifecycle(t *testing.T) {
	var receivedPath, receivedProfile, receivedAuthorization string
	runtime := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		receivedProfile = r.URL.Query().Get("profile")
		receivedAuthorization = r.Header.Get("Authorization")
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}))
	defer runtime.Close()
	config := testConfig(t, runtime.URL)
	config.ControlMode = "dashboard"
	server := NewServer(config, slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer server.Close()
	body := []byte(`{"action":"restart","profile":"profile-1"}`)
	request := signedRequest(t, http.MethodPost, "http://gateway/v1/control/gateway", "profile-1", body)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", response.Code, response.Body.String())
	}
	if receivedPath != "/api/gateway/restart" || receivedProfile != "profile-1" {
		t.Fatalf("unexpected dashboard target %s?profile=%s", receivedPath, receivedProfile)
	}
	if receivedAuthorization != "Bearer runtime-secret" {
		t.Fatalf("runtime authorization was not forwarded securely: %q", receivedAuthorization)
	}
}

func TestGatewayDrainRejectsNewSessionsAndCanResume(t *testing.T) {
	runtime := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	defer runtime.Close()
	server := NewServer(testConfig(t, runtime.URL), slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer server.Close()
	for action, expectedReady := range map[string]int{"drain": http.StatusServiceUnavailable, "resume": http.StatusOK} {
		body := []byte(fmt.Sprintf(`{"action":%q,"profile":"default"}`, action))
		response := httptest.NewRecorder()
		server.Handler().ServeHTTP(response, signedRequest(t, http.MethodPost, "http://gateway/v1/control/gateway", "default", body))
		if response.Code != http.StatusOK {
			t.Fatalf("%s failed: %d %s", action, response.Code, response.Body.String())
		}
		ready := httptest.NewRecorder()
		server.Handler().ServeHTTP(ready, httptest.NewRequest(http.MethodGet, "/readyz", nil))
		if ready.Code != expectedReady {
			t.Fatalf("%s ready status = %d", action, ready.Code)
		}
	}
}

func TestGatewayRevocationInvalidatesOutstandingTickets(t *testing.T) {
	runtime := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	defer runtime.Close()
	server := NewServer(testConfig(t, runtime.URL), slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer server.Close()
	issuedAt := time.Now().Add(-time.Second)
	ticket := makeTicket(t, Ticket{
		Version: 1, UserID: "user", TenantID: "tenant", WorkspaceID: "workspace", AgentID: "agent",
		InstallationID: "install-1", Profile: "default", Role: "member", IssuedAt: issuedAt.UnixMilli(), ExpiresAt: time.Now().Add(time.Minute).UnixMilli(),
	}, testSecret)
	body := []byte(`{"installationId":"install-1"}`)
	revoked := httptest.NewRecorder()
	server.Handler().ServeHTTP(revoked, signedRequest(t, http.MethodPost, "http://gateway/v1/control/revoke", "default", body))
	if revoked.Code != http.StatusOK {
		t.Fatalf("revocation failed: %d %s", revoked.Code, revoked.Body.String())
	}
	request := httptest.NewRequest(http.MethodGet, "http://gateway/v1/ws?ticket="+url.QueryEscape(ticket), nil)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("outstanding ticket survived revocation: %d", response.Code)
	}
}

func TestProfileValidationCreatesAndCleansEphemeralSession(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	calls := make(chan rpcRequest, 2)
	runtime := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/ws" {
			http.NotFound(w, r)
			return
		}
		connection, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer connection.Close()
		for range 2 {
			var request rpcRequest
			if err := connection.ReadJSON(&request); err != nil {
				return
			}
			calls <- request
			result := map[string]any{"ok": true}
			if request.Method == "session.create" {
				result["stored_session_id"] = "validation-session"
			}
			_ = connection.WriteJSON(map[string]any{"jsonrpc": "2.0", "id": request.ID, "result": result})
		}
	}))
	defer runtime.Close()
	server := NewServer(testConfig(t, runtime.URL), slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer server.Close()
	body := []byte(`{"profile":"profile-1"}`)
	request := signedRequest(t, http.MethodPost, "http://gateway/v1/control/profile-test", "profile-1", body)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", response.Code, response.Body.String())
	}
	created := <-calls
	deleted := <-calls
	if created.Method != "session.create" || created.Params["profile"] != "profile-1" {
		t.Fatalf("unexpected create request %#v", created)
	}
	if deleted.Method != "session.delete" || deleted.Params["session_id"] != "validation-session" || deleted.Params["profile"] != "profile-1" {
		t.Fatalf("validation session was not safely cleaned up: %#v", deleted)
	}
}

func TestSessionHubTargetsChangedSession(t *testing.T) {
	hub := &SessionHub{profiles: make(map[string]*profileObserver), hermesHome: t.TempDir(), debounce: time.Millisecond, logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	rows := []sessionSnapshot{{ID: "one", Version: "1"}, {ID: "two", Version: "1"}}
	hub.load = func(context.Context, string) ([]sessionSnapshot, error) { return rows, nil }
	events := make(chan sessionInvalidation, 4)
	unsubscribe, err := hub.Subscribe("profile", "one", func(event sessionInvalidation) { events <- event })
	if err != nil {
		t.Fatal(err)
	}
	defer unsubscribe()
	select {
	case event := <-events:
		if event.Reason != "subscribed" {
			t.Fatalf("unexpected initial event %#v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("initial event timed out")
	}

	hub.mu.Lock()
	observer := hub.profiles["profile"]
	hub.mu.Unlock()
	rows = []sessionSnapshot{{ID: "one", Version: "2"}, {ID: "two", Version: "1"}}
	hub.refresh(context.Background(), observer, "changed")
	select {
	case event := <-events:
		if event.SessionID != "one" || event.Reason != "changed" {
			t.Fatalf("unexpected change event %#v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("change event timed out")
	}
}
