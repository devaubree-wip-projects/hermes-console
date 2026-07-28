package gateway

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestWorkExecutorStreamsHermesTodoAndCompletesRun(t *testing.T) {
	const secret = "work-service-secret-at-least-24-characters"
	var mu sync.Mutex
	var events []runtimeWorkEvent
	var completion map[string]any

	control := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
			return
		}
		timestamp, _ := strconv.ParseInt(r.Header.Get(serviceTimestampHeader), 10, 64)
		expected := ServiceSignature(secret, r.Method, r.URL.RequestURI(), timestamp, r.Header.Get(serviceNonceHeader), "worker", body)
		if r.Header.Get(serviceInstallationHeader) != "edge-key" || r.Header.Get(serviceSignatureHeader) != expected {
			t.Errorf("invalid signed Work request for %s", r.URL.Path)
		}
		if !strings.HasPrefix(r.Header.Get("X-Request-Id"), "work-") {
			t.Errorf("missing Work request id for %s", r.URL.Path)
		}
		switch {
		case strings.HasSuffix(r.URL.Path, "/start"):
			writeJSON(w, http.StatusOK, map[string]any{"nextEventSequence": 3})
		case strings.HasSuffix(r.URL.Path, "/events"):
			var input struct {
				Events []runtimeWorkEvent `json:"events"`
			}
			_ = json.Unmarshal(body, &input)
			mu.Lock()
			events = append(events, input.Events...)
			mu.Unlock()
			writeJSON(w, http.StatusOK, map[string]any{"accepted": []int{input.Events[0].Sequence}})
		case strings.HasSuffix(r.URL.Path, "/complete"):
			_ = json.Unmarshal(body, &completion)
			writeJSON(w, http.StatusOK, map[string]any{"run": map[string]any{"status": completion["status"]}})
		default:
			t.Errorf("unexpected control path %s", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer control.Close()

	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	runtimeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		connection, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Error(err)
			return
		}
		defer connection.Close()
		var create map[string]any
		if err := connection.ReadJSON(&create); err != nil {
			t.Error(err)
			return
		}
		_ = connection.WriteJSON(map[string]any{
			"jsonrpc": "2.0", "id": create["id"],
			"result": map[string]any{"session_id": "live-1", "stored_session_id": "stored-1"},
		})
		var cwd map[string]any
		if err := connection.ReadJSON(&cwd); err != nil {
			t.Error(err)
			return
		}
		cwdParams, _ := cwd["params"].(map[string]any)
		if cwd["method"] != "session.cwd.set" || !strings.Contains(cwdParams["cwd"].(string), "run-20") {
			t.Errorf("unexpected cwd RPC: %#v", cwd)
		}
		_ = connection.WriteJSON(map[string]any{
			"jsonrpc": "2.0", "id": cwd["id"],
			"result": map[string]any{"cwd": cwdParams["cwd"]},
		})
		var prompt map[string]any
		if err := connection.ReadJSON(&prompt); err != nil {
			t.Error(err)
			return
		}
		if prompt["method"] != "prompt.submit" {
			t.Errorf("unexpected RPC method %v", prompt["method"])
		}
		_ = connection.WriteJSON(map[string]any{"jsonrpc": "2.0", "id": prompt["id"], "result": map[string]any{"accepted": true}})
		// A coding agent can legitimately stay silent while a tool is running. The
		// executor must keep the run alive through that quiet period.
		time.Sleep(2100 * time.Millisecond)
		_ = connection.WriteJSON(map[string]any{
			"jsonrpc": "2.0", "method": "event",
			"params": map[string]any{"type": "tool.complete", "session_id": "live-1", "payload": map[string]any{
				"name": "todo", "todos": []any{
					map[string]any{"id": "inspect", "content": "Inspecter", "status": "completed"},
					map[string]any{"id": "ship", "content": "Livrer", "status": "in_progress"},
				},
			}},
		})
		_ = connection.WriteJSON(map[string]any{
			"jsonrpc": "2.0", "method": "event",
			"params": map[string]any{"type": "message.complete", "session_id": "live-1", "payload": map[string]any{"content": "Travail terminé."}},
		})
	}))
	defer runtimeServer.Close()
	controlURL, _ := url.Parse(control.URL)
	runtimeURL, _ := url.Parse("ws" + strings.TrimPrefix(runtimeServer.URL, "http"))
	workRoot := t.TempDir()
	executor := NewWorkExecutor(Config{
		RuntimeWSURL:          runtimeURL,
		RuntimeToken:          "runtime-token",
		ServiceSecret:         secret,
		InstallationID:        "edge-key",
		WorkInstallationID:    "00000000-0000-4000-8000-000000000010",
		WorkControlPlaneURL:   controlURL,
		WorkHeartbeatInterval: time.Hour,
		WorkRoot:              workRoot,
	}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	executor.execute(context.Background(), claimedWorkRun{
		RunID:       "run-20",
		WorkItemID:  "item-10",
		WorkspaceID: "workspace-1",
		Profile:     "worker",
		Prompt:      "Exécute cette tâche",
		LeaseToken:  strings.Repeat("l", 43),
		Title:       "Tâche de test",
	})
	mu.Lock()
	defer mu.Unlock()
	if len(events) != 2 || events[0].Type != "tool.complete" || events[0].Sequence != 3 || events[1].Type != "message.complete" || events[1].Sequence != 4 {
		t.Fatalf("unexpected streamed events: %#v", events)
	}
	if completion["status"] != "succeeded" || completion["resultSummary"] != "Travail terminé." {
		t.Fatalf("unexpected completion: %#v", completion)
	}
	manifest, err := os.ReadFile(filepath.Join(workRoot, "workspaces", "workspace-1", "work", "item-10", "manifest.json"))
	if err != nil || !strings.Contains(string(manifest), `"runId": "run-20"`) {
		t.Fatalf("missing isolated Work manifest: %s err=%v", manifest, err)
	}
}

func TestInterventionSafePayloadNeverForwardsSecretMaterial(t *testing.T) {
	secretPayload := map[string]any{"value": "do-not-persist", "provider": "test"}
	if payload := interventionSafePayload("secret", secretPayload); len(payload) != 0 {
		t.Fatalf("secret payload must be empty, got %#v", payload)
	}
	if payload := interventionSafePayload("sudo", secretPayload); len(payload) != 0 {
		t.Fatalf("sudo payload must be empty, got %#v", payload)
	}
	if payload := interventionSafePayload("clarification", secretPayload); payload["provider"] != "test" {
		t.Fatalf("non-sensitive intervention metadata should remain available, got %#v", payload)
	}
}

func TestSecureMkdirAllRejectsSymbolicLinkEscape(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(root, "escape")); err != nil {
		t.Fatal(err)
	}
	if err := secureMkdirAll(root, filepath.Join(root, "escape", "run")); err == nil {
		t.Fatal("symbolic link escape was accepted")
	}
}

func TestWorkExecutorClaimUsesSignedInstallationIdentity(t *testing.T) {
	const secret = "work-service-secret-at-least-24-characters"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		timestamp, _ := strconv.ParseInt(r.Header.Get(serviceTimestampHeader), 10, 64)
		expected := ServiceSignature(secret, r.Method, r.URL.RequestURI(), timestamp, r.Header.Get(serviceNonceHeader), "default", body)
		if r.Header.Get(serviceSignatureHeader) != expected || r.Header.Get(serviceInstallationHeader) != "edge-key" {
			t.Fatal("claim was not signed with the installation identity")
		}
		writeJSON(w, http.StatusOK, map[string]any{"runs": []any{}})
	}))
	defer server.Close()
	controlURL, _ := url.Parse(server.URL)
	executor := NewWorkExecutor(Config{
		ServiceSecret: secret, InstallationID: "edge-key", WorkInstallationID: "installation-record", WorkControlPlaneURL: controlURL,
	}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	runs, err := executor.claim(context.Background(), 2)
	if err != nil || len(runs) != 0 {
		t.Fatalf("claim failed: runs=%v err=%v", runs, err)
	}
}

// The Console rejects any Work request that does not name its installation, so the
// id has to travel on every endpoint — not just on claim, where it started out.
func TestWorkExecutorNamesInstallationOnEveryWorkRequest(t *testing.T) {
	const secret = "work-service-secret-at-least-24-characters"
	seen := map[string]string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var decoded map[string]any
		if err := json.Unmarshal(body, &decoded); err != nil {
			t.Fatalf("unreadable body on %s: %v", r.URL.Path, err)
		}
		id, _ := decoded["installationId"].(string)
		seen[r.URL.Path] = id
		writeJSON(w, http.StatusOK, map[string]any{"runs": []any{}})
	}))
	defer server.Close()
	controlURL, _ := url.Parse(server.URL)
	executor := NewWorkExecutor(Config{
		ServiceSecret: secret, InstallationID: "edge-key",
		WorkInstallationID:  "00000000-0000-4000-8000-000000000010",
		WorkControlPlaneURL: controlURL,
	}, slog.New(slog.NewTextHandler(io.Discard, nil)))

	run := claimedWorkRun{RunID: "11111111-2222-4333-8444-555555555555", Profile: "default"}
	if _, err := executor.claim(context.Background(), 1); err != nil {
		t.Fatalf("claim: %v", err)
	}
	if err := executor.appendEvent(context.Background(), run, "default", runtimeWorkEvent{Type: "run.log"}); err != nil {
		t.Fatalf("appendEvent: %v", err)
	}
	if err := executor.complete(context.Background(), run, "default", "succeeded", "", ""); err != nil {
		t.Fatalf("complete: %v", err)
	}
	executor.release(context.Background(), run, "test")

	if len(seen) < 4 {
		t.Fatalf("expected every endpoint to be exercised, got %v", seen)
	}
	for path, id := range seen {
		if id != "00000000-0000-4000-8000-000000000010" {
			t.Fatalf("%s did not name its installation: %q", path, id)
		}
	}
}

func TestWorkExecutorResumeIdleSessionNeverResubmitsPrompt(t *testing.T) {
	const secret = "work-service-secret-at-least-24-characters"
	var completion map[string]any
	control := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		switch {
		case strings.HasSuffix(r.URL.Path, "/start"):
			writeJSON(w, http.StatusOK, map[string]any{"nextEventSequence": 7})
		case strings.HasSuffix(r.URL.Path, "/complete"):
			_ = json.Unmarshal(body, &completion)
			writeJSON(w, http.StatusOK, map[string]any{"run": map[string]any{"status": completion["status"]}})
		default:
			t.Fatalf("unexpected control path %s", r.URL.Path)
		}
	}))
	defer control.Close()

	var extraRPC bool
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	runtimeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		connection, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Error(err)
			return
		}
		defer connection.Close()
		var resume map[string]any
		if err := connection.ReadJSON(&resume); err != nil {
			t.Error(err)
			return
		}
		if resume["method"] != "session.resume" {
			t.Errorf("expected session.resume, got %#v", resume)
		}
		_ = connection.WriteJSON(map[string]any{
			"jsonrpc": "2.0", "id": resume["id"],
			"result": map[string]any{
				"session_id": "live-resumed", "stored_session_id": "stored-resumed", "running": false,
				"messages": []any{map[string]any{"role": "assistant", "content": "Résultat déjà produit."}},
			},
		})
		_ = connection.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
		var unexpected map[string]any
		if err := connection.ReadJSON(&unexpected); err == nil {
			extraRPC = true
		}
	}))
	defer runtimeServer.Close()

	controlURL, _ := url.Parse(control.URL)
	runtimeURL, _ := url.Parse("ws" + strings.TrimPrefix(runtimeServer.URL, "http"))
	executor := NewWorkExecutor(Config{
		RuntimeWSURL: runtimeURL, RuntimeToken: "runtime-token", ServiceSecret: secret,
		InstallationID: "edge-key", WorkInstallationID: "00000000-0000-4000-8000-000000000010",
		WorkControlPlaneURL: controlURL, WorkHeartbeatInterval: time.Hour, WorkRoot: t.TempDir(),
	}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	executor.execute(context.Background(), claimedWorkRun{
		RunID: "run-resume", WorkItemID: "item-resume", WorkspaceID: "workspace-resume",
		Profile: "worker", Prompt: "Ne doit pas être resoumis", ResumeSessionID: "stored-resumed",
		LeaseToken: strings.Repeat("l", 43), Title: "Reprise sûre",
	})
	if extraRPC {
		t.Fatal("an idle resumed session received a duplicate cwd or prompt RPC")
	}
	if completion["status"] != "succeeded" || completion["resultSummary"] != "Résultat déjà produit." {
		t.Fatalf("unexpected recovered completion: %#v", completion)
	}
}

func TestWorkStreamCancellationInterruptsHermes(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	interrupts := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		connection, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Error(err)
			return
		}
		defer connection.Close()
		var rpc map[string]any
		if err := connection.ReadJSON(&rpc); err == nil {
			interrupts <- rpc
		}
	}))
	defer server.Close()
	runtimeURL, _ := url.Parse("ws" + strings.TrimPrefix(server.URL, "http"))
	connection, _, err := websocket.DefaultDialer.Dial(runtimeURL.String(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	executor := NewWorkExecutor(Config{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	commands := make(chan workCommand, 1)
	commands <- workCommand{Type: "cancel"}
	sequence := 1
	var writeMu sync.Mutex
	_, status, failure := executor.streamRun(context.Background(), connection, &writeMu, claimedWorkRun{}, "worker", "live-session", &sequence, commands)
	if status != "cancelled" || failure != "cancelled_by_user" {
		t.Fatalf("unexpected cancellation: %s %s", status, failure)
	}
	select {
	case rpc := <-interrupts:
		if rpc["method"] != "session.interrupt" {
			t.Fatalf("unexpected cancellation RPC: %#v", rpc)
		}
	case <-time.After(time.Second):
		t.Fatal("Hermes did not receive session.interrupt")
	}
}

func TestWorkStreamClassifiesRuntimeDisconnect(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		connection, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Error(err)
			return
		}
		_ = connection.Close()
	}))
	defer server.Close()
	runtimeURL, _ := url.Parse("ws" + strings.TrimPrefix(server.URL, "http"))
	connection, _, err := websocket.DefaultDialer.Dial(runtimeURL.String(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	executor := NewWorkExecutor(Config{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	sequence := 1
	var writeMu sync.Mutex
	_, status, failure := executor.streamRun(context.Background(), connection, &writeMu, claimedWorkRun{}, "worker", "live-session", &sequence, make(chan workCommand))
	if status != "failed" || failure != "runtime_disconnected" {
		t.Fatalf("unexpected disconnect classification: %s %s", status, failure)
	}
}
