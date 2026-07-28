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
	"testing"
	"time"
)

func TestMaterializeConsoleResourceUsesSignedRunLeaseAndWritesAtomically(t *testing.T) {
	const secret = "resource-service-secret-at-least-24-characters"
	content := []byte("console resource\n")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		timestamp, _ := strconv.ParseInt(r.Header.Get(serviceTimestampHeader), 10, 64)
		expected := ServiceSignature(
			secret,
			r.Method,
			r.URL.RequestURI(),
			timestamp,
			r.Header.Get(serviceNonceHeader),
			"worker",
			body,
		)
		if r.URL.Path != workResourceDownloadPath ||
			r.Header.Get(serviceInstallationHeader) != "edge-key" ||
			r.Header.Get(serviceSignatureHeader) != expected {
			http.Error(w, "invalid signature", http.StatusUnauthorized)
			return
		}
		var payload map[string]any
		_ = json.Unmarshal(body, &payload)
		if payload["runId"] != "run-1" ||
			payload["resourceId"] != "11111111-2222-4333-8444-555555555555" ||
			payload["leaseToken"] != "lease-secret" {
			http.Error(w, "wrong association", http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Length", strconv.Itoa(len(content)))
		_, _ = w.Write(content)
	}))
	defer server.Close()
	controlURL, _ := url.Parse(server.URL)
	workRoot := t.TempDir()
	executor := NewWorkExecutor(Config{
		ServiceSecret:       secret,
		InstallationID:      "edge-key",
		WorkInstallationID:  "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
		WorkControlPlaneURL: controlURL,
		WorkRoot:            workRoot,
	}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	run := claimedWorkRun{
		RunID:       "run-1",
		WorkItemID:  "item-1",
		WorkspaceID: "workspace-1",
		Profile:     "worker",
		LeaseToken:  "lease-secret",
		Resources: []claimedWorkResource{{
			ResourceID: "11111111-2222-4333-8444-555555555555",
			Name:       "brief.txt",
			Source:     "console",
			TargetPath: "brief/brief.txt",
		}},
	}
	runRoot, err := executor.prepareRunWorkdir(run)
	if err != nil {
		t.Fatal(err)
	}
	if err := executor.materializeRunResources(context.Background(), run, runRoot); err != nil {
		t.Fatal(err)
	}
	staged, err := os.ReadFile(filepath.Join(workRoot, "workspaces", "workspace-1", "work", "item-1", "runs", "run-1", "resources", "brief", "brief.txt"))
	if err != nil || string(staged) != string(content) {
		t.Fatalf("staged resource = %q err=%v", staged, err)
	}
	run.Resources = nil
	if err := executor.materializeRunResources(context.Background(), run, runRoot); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(runRoot, "resources", "brief", "brief.txt")); !os.IsNotExist(err) {
		t.Fatalf("revoked resource survived retry: %v", err)
	}
}

func TestMaterializeResourceRejectsTraversalAndOversize(t *testing.T) {
	t.Setenv("HERMES_WORK_RESOURCE_MAX_BYTES", "4")
	t.Setenv("HERMES_WORK_RESOURCE_TOTAL_MAX_BYTES", "8")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Length", "5")
		_, _ = w.Write([]byte("12345"))
	}))
	defer server.Close()
	controlURL, _ := url.Parse(server.URL)
	executor := NewWorkExecutor(Config{
		ServiceSecret:       "resource-service-secret-at-least-24-characters",
		InstallationID:      "edge-key",
		WorkInstallationID:  "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
		WorkControlPlaneURL: controlURL,
		WorkRoot:            t.TempDir(),
	}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	base := claimedWorkRun{
		RunID: "run-1", WorkItemID: "item-1", WorkspaceID: "workspace-1",
		Profile: "worker", LeaseToken: "lease-secret",
	}
	runRoot, err := executor.prepareRunWorkdir(base)
	if err != nil {
		t.Fatal(err)
	}
	traversal := base
	traversal.Resources = []claimedWorkResource{{
		ResourceID: "11111111-2222-4333-8444-555555555555",
		Name:       "escape", Source: "console", TargetPath: "../escape",
	}}
	if err := executor.materializeRunResources(context.Background(), traversal, runRoot); err == nil ||
		!strings.Contains(err.Error(), "escapes") {
		t.Fatalf("expected traversal rejection, got %v", err)
	}
	oversize := base
	oversize.Resources = []claimedWorkResource{{
		ResourceID: "11111111-2222-4333-8444-555555555555",
		Name:       "large", Source: "console", TargetPath: "large.bin",
	}}
	if err := executor.materializeRunResources(context.Background(), oversize, runRoot); err == nil ||
		!strings.Contains(err.Error(), "quota") {
		t.Fatalf("expected quota rejection, got %v", err)
	}
}

func TestReadOnlyGrantRequiresExplicitEnableAndRejectsSymlinks(t *testing.T) {
	root := t.TempDir()
	aliasRoot := filepath.Join(root, "code")
	if err := os.Mkdir(aliasRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(aliasRoot, "safe.txt"), []byte("safe\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "outside.txt")
	if err := os.WriteFile(outside, []byte("private\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(aliasRoot, "escape.txt")); err != nil {
		t.Fatal(err)
	}
	resource := claimedWorkResource{
		ResourceID: "11111111-2222-4333-8444-555555555555",
		Name:       "safe", Source: "grant", TargetPath: "grants/code/safe.txt",
		GrantAlias: "code", GrantPath: "safe.txt",
	}
	t.Setenv("HERMES_FS_GRANT_ROOT", root)
	if _, _, err := openGrantedResource(resource); err == nil ||
		!strings.Contains(err.Error(), "disabled") {
		t.Fatalf("expected disabled grant, got %v", err)
	}
	t.Setenv("HERMES_FS_GRANTS_ENABLED", "true")
	file, size, err := openGrantedResource(resource)
	if err != nil {
		t.Fatal(err)
	}
	contents, _ := io.ReadAll(file)
	_ = file.Close()
	if string(contents) != "safe\n" || size != 5 {
		t.Fatalf("grant contents=%q size=%d", contents, size)
	}
	executor := NewWorkExecutor(Config{WorkRoot: t.TempDir()}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	run := claimedWorkRun{
		RunID: "run-grant", WorkItemID: "item-grant", WorkspaceID: "workspace-grant",
		Resources: []claimedWorkResource{resource},
	}
	runRoot, err := executor.prepareRunWorkdir(run)
	if err != nil {
		t.Fatal(err)
	}
	if err := executor.materializeRunResources(context.Background(), run, runRoot); err != nil {
		t.Fatal(err)
	}
	staged, err := os.ReadFile(filepath.Join(runRoot, "resources", "grants", "code", "safe.txt"))
	if err != nil || string(staged) != "safe\n" {
		t.Fatalf("staged grant = %q err=%v", staged, err)
	}
	resource.GrantPath = "escape.txt"
	if _, _, err := openGrantedResource(resource); err == nil {
		t.Fatalf("expected symlink rejection, got %v", err)
	}
	if err := os.Mkdir(filepath.Join(aliasRoot, "nested"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Dir(outside), filepath.Join(aliasRoot, "nested", "swap")); err != nil {
		t.Fatal(err)
	}
	resource.GrantPath = "nested/swap/outside.txt"
	if _, _, err := openGrantedResource(resource); err == nil {
		t.Fatalf("expected intermediate symlink rejection, got %v", err)
	}
}

func TestMaterializeResourceRejectsExcessiveDescriptorCount(t *testing.T) {
	t.Setenv("HERMES_WORK_RESOURCE_MAX_COUNT", "2")
	run := claimedWorkRun{
		Resources: []claimedWorkResource{
			{ResourceID: "11111111-2222-4333-8444-555555555551"},
			{ResourceID: "11111111-2222-4333-8444-555555555552"},
			{ResourceID: "11111111-2222-4333-8444-555555555553"},
		},
	}
	executor := NewWorkExecutor(
		Config{WorkRoot: t.TempDir()},
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	if err := executor.materializeRunResources(context.Background(), run, t.TempDir()); err == nil ||
		!strings.Contains(err.Error(), "too many") {
		t.Fatalf("expected resource count rejection, got %v", err)
	}
}

func TestSignedResourceDownloadRejectsNonSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "denied", http.StatusForbidden)
	}))
	defer server.Close()
	controlURL, _ := url.Parse(server.URL)
	executor := NewWorkExecutor(Config{
		ServiceSecret:       "resource-service-secret-at-least-24-characters",
		InstallationID:      "edge-key",
		WorkInstallationID:  "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
		WorkControlPlaneURL: controlURL,
	}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, _, err := executor.downloadConsoleResource(ctx, claimedWorkRun{
		RunID: "run-1", Profile: "default", LeaseToken: "lease",
	}, claimedWorkResource{
		ResourceID: "11111111-2222-4333-8444-555555555555",
		Source:     "console",
	})
	if err == nil || !strings.Contains(err.Error(), "403") {
		t.Fatalf("expected denied download, got %v", err)
	}
}

func TestStagingHeartbeatRenewsLeaseBeforeRunStart(t *testing.T) {
	requestSeen := make(chan struct{}, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/heartbeat") {
			http.Error(w, "unexpected path", http.StatusNotFound)
			return
		}
		select {
		case requestSeen <- struct{}{}:
		default:
		}
		_, _ = io.WriteString(w, `{"commands":[]}`)
	}))
	defer server.Close()
	controlURL, _ := url.Parse(server.URL)
	executor := NewWorkExecutor(Config{
		ServiceSecret:         "resource-service-secret-at-least-24-characters",
		InstallationID:        "edge-key",
		WorkInstallationID:    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
		WorkControlPlaneURL:   controlURL,
		WorkHeartbeatInterval: time.Hour,
	}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		executor.stagingHeartbeatLoop(ctx, claimedWorkRun{
			RunID:      "run-1",
			Profile:    "worker",
			LeaseToken: "lease-secret",
		}, "worker")
	}()
	select {
	case <-requestSeen:
	case <-time.After(time.Second):
		t.Fatal("staging heartbeat did not renew the lease")
	}
	cancel()
	<-done
}
