package gateway

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/MakFly/hermes-console/packages/shared/gatewaycontracts"
	"github.com/gorilla/websocket"
)

type WorkExecutor struct {
	config Config
	logger *slog.Logger
	client *http.Client
	active atomic.Int32
}

type claimedWorkRun struct {
	RunID             string                `json:"runId"`
	InstallationID    string                `json:"installationId"`
	WorkItemID        string                `json:"workItemId"`
	WorkspaceID       string                `json:"workspaceId"`
	Profile           string                `json:"profile"`
	Prompt            string                `json:"prompt"`
	Context           map[string]any        `json:"context"`
	Resources         []claimedWorkResource `json:"resources"`
	ResumeSessionID   string                `json:"resumeSessionId"`
	LeaseToken        string                `json:"leaseToken"`
	LeaseExpiresAt    string                `json:"leaseExpiresAt"`
	NextEventSequence int                   `json:"nextEventSequence"`
	Title             string                `json:"title"`
}

type workCommand struct {
	Type             string         `json:"type"`
	InterventionID   string         `json:"interventionId"`
	RequestID        string         `json:"requestId"`
	InterventionType string         `json:"interventionType"`
	Decision         string         `json:"decision"`
	Payload          map[string]any `json:"payload"`
}

type runtimeWorkEvent struct {
	Sequence   int            `json:"sequence"`
	Type       string         `json:"type"`
	Payload    map[string]any `json:"payload,omitempty"`
	OccurredAt string         `json:"occurredAt"`
	Visibility string         `json:"visibility,omitempty"`
}

func NewWorkExecutor(config Config, logger *slog.Logger) *WorkExecutor {
	if logger == nil {
		logger = DefaultLogger()
	}
	return &WorkExecutor{
		config: config,
		logger: logger.With("component", "work-executor"),
		client: &http.Client{Timeout: 15 * time.Second},
	}
}

func (executor *WorkExecutor) Run(ctx context.Context) {
	capacity := executor.config.WorkCapacity
	if capacity < 1 {
		capacity = 1
	}
	if capacity > 16 {
		capacity = 16
	}
	interval := executor.config.WorkPollInterval
	if interval < 250*time.Millisecond {
		interval = 250 * time.Millisecond
	}
	executor.logger.Info("Work executor started", "capacity", capacity, "controlPlane", executor.config.WorkControlPlaneURL.Redacted())
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		free := capacity - int(executor.active.Load())
		if free > 0 {
			runs, err := executor.claim(ctx, free)
			if err != nil {
				executor.logger.Warn("Work claim failed", "error", err)
			} else {
				for _, run := range runs {
					executor.active.Add(1)
					go func(run claimedWorkRun) {
						defer executor.active.Add(-1)
						executor.execute(ctx, run)
					}(run)
				}
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (executor *WorkExecutor) claim(ctx context.Context, capacity int) ([]claimedWorkRun, error) {
	var response struct {
		Runs []claimedWorkRun `json:"runs"`
	}
	body := map[string]any{"edgeId": executor.edgeID(), "capacity": capacity}
	err := executor.post(ctx, gatewaycontracts.Spec.Work.Paths.Claim, "default", body, &response)
	return response.Runs, err
}

func (executor *WorkExecutor) edgeID() string {
	if value := strings.TrimSpace(executor.config.InstallationID); value != "" {
		return value
	}
	return "edge"
}

func (executor *WorkExecutor) post(ctx context.Context, path, profile string, body map[string]any, output any) error {
	// Injected centrally rather than per call site: the Console resolves the
	// installation row by primary key and rejects any Work request that does not
	// name one, so a forgotten field would 401 that endpoint and nothing else.
	if body == nil {
		body = map[string]any{}
	}
	body["installationId"] = executor.config.WorkInstallationID
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	endpoint := *executor.config.WorkControlPlaneURL
	basePath := strings.TrimSuffix(endpoint.Path, "/")
	endpoint.Path = basePath + path
	endpoint.RawQuery = ""
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewReader(payload))
	if err != nil {
		return err
	}
	nonceBytes := make([]byte, 24)
	if _, err := rand.Read(nonceBytes); err != nil {
		return err
	}
	nonce := hex.EncodeToString(nonceBytes)
	timestamp := time.Now().UnixMilli()
	if profile == "" {
		profile = "default"
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(serviceInstallationHeader, executor.config.InstallationID)
	request.Header.Set(serviceProfileHeader, profile)
	request.Header.Set(serviceTimestampHeader, fmt.Sprintf("%d", timestamp))
	request.Header.Set(serviceNonceHeader, nonce)
	request.Header.Set(serviceSignatureHeader, ServiceSignature(executor.config.ServiceSecret, request.Method, request.URL.RequestURI(), timestamp, nonce, profile, payload))
	request.Header.Set(gatewaycontracts.Spec.ServiceHeaders.RequestID, "work-"+nonce[:16])
	response, err := executor.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		message, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return fmt.Errorf("control plane %s returned %s: %s", path, response.Status, strings.TrimSpace(string(message)))
	}
	if output == nil {
		_, _ = io.Copy(io.Discard, response.Body)
		return nil
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(output); err != nil {
		return fmt.Errorf("decode control plane response: %w", err)
	}
	return nil
}

func (executor *WorkExecutor) execute(parent context.Context, run claimedWorkRun) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	connection, err := executor.connectRuntime(ctx)
	if err != nil {
		executor.release(ctx, run, "runtime_unavailable")
		executor.logger.Warn("Work runtime unavailable", "runId", run.RunID, "error", err)
		return
	}
	defer connection.Close()
	rpcTimeout := executor.config.UpstreamTimeout
	if rpcTimeout <= 0 {
		rpcTimeout = 5 * time.Second
	}
	deadline := time.Now().Add(rpcTimeout)
	_ = connection.SetWriteDeadline(deadline)
	_ = connection.SetReadDeadline(deadline)
	profile := run.Profile
	if profile == "" {
		profile = "default"
	}
	var session map[string]any
	if run.ResumeSessionID != "" {
		session, err = runtimeRPCCall(connection, 1, "session.resume", map[string]any{"session_id": run.ResumeSessionID, "profile": profile})
	} else {
		session, err = runtimeRPCCall(connection, 1, "session.create", map[string]any{"source": "hermes-console-work", "profile": profile, "title": run.Title})
	}
	if err != nil {
		executor.release(ctx, run, "session_prepare_failed")
		executor.logger.Warn("Work session preparation failed", "runId", run.RunID, "error", err)
		return
	}
	_ = connection.SetWriteDeadline(time.Time{})
	_ = connection.SetReadDeadline(time.Time{})
	liveSessionID, _ := session["session_id"].(string)
	storedSessionID, _ := session["stored_session_id"].(string)
	if storedSessionID == "" {
		storedSessionID = run.ResumeSessionID
	}
	if storedSessionID == "" {
		storedSessionID = liveSessionID
	}
	sessionRunning, _ := session["running"].(bool)
	if liveSessionID == "" || storedSessionID == "" {
		executor.release(ctx, run, "invalid_session")
		return
	}
	workdir, err := executor.prepareRunWorkdir(run)
	if err != nil {
		_ = executor.complete(ctx, run, profile, "failed", "", "workdir_prepare_failed")
		executor.logger.Warn("Work directory preparation failed", "runId", run.RunID, "error", err)
		return
	}
	var materializeErr error
	if len(run.Resources) > 0 {
		stagingHeartbeatCtx, stopStagingHeartbeat := context.WithCancel(ctx)
		stagingHeartbeatDone := make(chan struct{})
		go func() {
			defer close(stagingHeartbeatDone)
			executor.stagingHeartbeatLoop(stagingHeartbeatCtx, run, profile)
		}()
		materializeErr = executor.materializeRunResources(ctx, run, workdir)
		stopStagingHeartbeat()
		<-stagingHeartbeatDone
	} else {
		// An empty claim is still an authorization snapshot: clear resources
		// left by a prior attempt of the same run.
		materializeErr = executor.materializeRunResources(ctx, run, workdir)
	}
	if materializeErr != nil {
		_ = executor.complete(ctx, run, profile, "failed", "", "resource_materialization_failed")
		executor.logger.Warn("Work resource materialization failed", "runId", run.RunID, "error", materializeErr)
		return
	}
	if run.ResumeSessionID == "" {
		deadline = time.Now().Add(rpcTimeout)
		_ = connection.SetWriteDeadline(deadline)
		_ = connection.SetReadDeadline(deadline)
		_, err = runtimeRPCCall(connection, 2, "session.cwd.set", map[string]any{
			"session_id": liveSessionID,
			"cwd":        workdir,
			"profile":    profile,
		})
		_ = connection.SetWriteDeadline(time.Time{})
		_ = connection.SetReadDeadline(time.Time{})
		if err != nil {
			_ = executor.complete(ctx, run, profile, "failed", "", "workdir_prepare_failed")
			executor.logger.Warn("Work session directory rejected", "runId", run.RunID, "error", err)
			return
		}
	}
	var started struct {
		NextEventSequence int `json:"nextEventSequence"`
	}
	if err := executor.post(ctx, workRunPath(gatewaycontracts.Spec.Work.Paths.RunStart, run.RunID), profile, map[string]any{
		"installationId":  executor.runInstallationID(run),
		"leaseToken":      run.LeaseToken,
		"hermesSessionId": storedSessionID,
	}, &started); err != nil {
		executor.logger.Warn("Work start rejected", "runId", run.RunID, "error", err)
		return
	}
	sequence := started.NextEventSequence
	if sequence < 1 {
		sequence = run.NextEventSequence
	}
	if run.ResumeSessionID != "" && !sessionRunning {
		if recovered := resumedSessionResult(session); recovered != "" {
			_ = executor.complete(context.WithoutCancel(ctx), run, profile, "succeeded", recovered, "")
		} else {
			_ = executor.complete(context.WithoutCancel(ctx), run, profile, "failed", "", "resume_session_idle_without_result")
		}
		return
	}
	var writeMu sync.Mutex
	commands := make(chan workCommand, 8)
	heartbeatCtx, stopHeartbeat := context.WithCancel(ctx)
	defer stopHeartbeat()
	go executor.heartbeatLoop(heartbeatCtx, run, profile, commands)

	if run.ResumeSessionID == "" {
		prompt := run.Prompt
		if len(run.Resources) > 0 {
			prompt += "\n\nLes fichiers autorisés sont matérialisés en lecture de départ dans ./resources."
		}
		writeMu.Lock()
		err = connection.WriteJSON(map[string]any{"jsonrpc": "2.0", "id": 3, "method": "prompt.submit", "params": map[string]any{
			"session_id": liveSessionID, "text": prompt, "profile": profile,
		}})
		writeMu.Unlock()
		if err != nil {
			executor.complete(ctx, run, profile, "failed", "", "prompt_submit_failed")
			return
		}
	}
	result, status, failure := executor.streamRun(ctx, connection, &writeMu, run, profile, liveSessionID, &sequence, commands)
	stopHeartbeat()
	if err := executor.complete(context.WithoutCancel(ctx), run, profile, status, result, failure); err != nil {
		executor.logger.Warn("Work completion failed", "runId", run.RunID, "error", err)
	}
}

func resumedSessionResult(session map[string]any) string {
	messages, _ := session["messages"].([]any)
	for index := len(messages) - 1; index >= 0; index-- {
		message, _ := messages[index].(map[string]any)
		role := strings.ToLower(firstString(message, "role", "type"))
		if role != "assistant" {
			continue
		}
		if result := firstString(message, "content", "text", "message", "result"); result != "" {
			return result
		}
	}
	return ""
}

var safeWorkPathSegment = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$`)

func (executor *WorkExecutor) prepareRunWorkdir(run claimedWorkRun) (string, error) {
	for label, value := range map[string]string{
		"workspace": run.WorkspaceID,
		"work item": run.WorkItemID,
		"run":       run.RunID,
	} {
		if !safeWorkPathSegment.MatchString(value) {
			return "", fmt.Errorf("invalid %s identifier", label)
		}
	}
	root := filepath.Clean(executor.config.WorkRoot)
	if root == "." || !filepath.IsAbs(root) {
		return "", fmt.Errorf("Work root must be absolute")
	}
	anchor := filepath.VolumeName(root) + string(filepath.Separator)
	if err := secureMkdirAll(anchor, root); err != nil {
		return "", err
	}
	itemRoot := filepath.Join(root, "workspaces", run.WorkspaceID, "work", run.WorkItemID)
	runRoot := filepath.Join(itemRoot, "runs", run.RunID)
	for _, path := range []string{
		filepath.Join(itemRoot, "context"),
		runRoot,
		filepath.Join(runRoot, "resources"),
		filepath.Join(itemRoot, "output"),
	} {
		if err := secureMkdirAll(root, path); err != nil {
			return "", err
		}
	}
	manifestPath := filepath.Join(itemRoot, "manifest.json")
	if info, err := os.Lstat(manifestPath); err == nil && info.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("Work manifest is a symbolic link")
	} else if err != nil && !os.IsNotExist(err) {
		return "", err
	}
	manifest, err := json.MarshalIndent(map[string]any{
		"workspaceId": run.WorkspaceID,
		"workItemId":  run.WorkItemID,
		"runId":       run.RunID,
		"profile":     run.Profile,
		"permissions": map[string]string{
			"workspaceSource": "read_only",
			"taskOutput":      "read_write",
			// This is an execution convention, not an OS sandbox. Inputs are
			// copied per run so future runtimes can mount this directory alone.
			"isolation": "run_scoped_cwd_not_chroot",
		},
	}, "", "  ")
	if err != nil {
		return "", err
	}
	temporary, err := os.CreateTemp(itemRoot, ".manifest-*")
	if err != nil {
		return "", err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		_ = temporary.Close()
		return "", err
	}
	if _, err := temporary.Write(append(manifest, '\n')); err != nil {
		_ = temporary.Close()
		return "", err
	}
	if err := temporary.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(temporaryPath, manifestPath); err != nil {
		return "", err
	}
	return runRoot, nil
}

func secureMkdirAll(root, target string) error {
	relative, err := filepath.Rel(root, target)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return fmt.Errorf("Work path escapes configured root")
	}
	current := root
	parts := []string{"."}
	if relative != "." {
		parts = append(parts, strings.Split(relative, string(filepath.Separator))...)
	}
	for _, part := range parts {
		if part != "." {
			current = filepath.Join(current, part)
		}
		info, statErr := os.Lstat(current)
		if os.IsNotExist(statErr) {
			if mkdirErr := os.Mkdir(current, 0o700); mkdirErr != nil && !os.IsExist(mkdirErr) {
				return mkdirErr
			}
			info, statErr = os.Lstat(current)
		}
		if statErr != nil {
			return statErr
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return fmt.Errorf("Work path contains a non-directory or symbolic link: %s", current)
		}
	}
	return nil
}

func (executor *WorkExecutor) connectRuntime(ctx context.Context) (*websocket.Conn, error) {
	endpoint := *executor.config.RuntimeWSURL
	if executor.config.RuntimeToken != "" {
		query := endpoint.Query()
		query.Set("token", executor.config.RuntimeToken)
		endpoint.RawQuery = query.Encode()
	}
	headers := http.Header{}
	addRuntimeAuth(headers, executor.config.RuntimeToken)
	connection, response, err := websocket.DefaultDialer.DialContext(ctx, endpoint.String(), headers)
	if response != nil && response.Body != nil {
		_ = response.Body.Close()
	}
	return connection, err
}

func (executor *WorkExecutor) streamRun(ctx context.Context, connection *websocket.Conn, writeMu *sync.Mutex, run claimedWorkRun, profile, liveSessionID string, sequence *int, commands <-chan workCommand) (string, string, string) {
	type runtimeFrame struct {
		value map[string]any
		err   error
	}
	frames := make(chan runtimeFrame, 1)
	go func() {
		for {
			var frame map[string]any
			err := connection.ReadJSON(&frame)
			select {
			case frames <- runtimeFrame{value: frame, err: err}:
			case <-ctx.Done():
				return
			}
			if err != nil {
				return
			}
		}
	}()
	deliveredInterventions := make(map[string]struct{})
	for {
		select {
		case <-ctx.Done():
			return "", "cancelled", "edge_stopping"
		case command := <-commands:
			if command.Type == "cancel" {
				executor.writeRPC(writeMu, connection, 9000, "session.interrupt", map[string]any{"session_id": liveSessionID, "profile": profile})
				return "", "cancelled", "cancelled_by_user"
			}
			key := command.InterventionID
			if key == "" {
				key = command.InterventionType + ":" + command.RequestID
			}
			if _, delivered := deliveredInterventions[key]; delivered {
				continue
			}
			executor.respondToIntervention(writeMu, connection, liveSessionID, profile, command)
			deliveredInterventions[key] = struct{}{}
		case received := <-frames:
			if received.err != nil {
				return "", "failed", "runtime_disconnected"
			}
			frame := received.value
			if frame["method"] != "event" {
				continue
			}
			params, _ := frame["params"].(map[string]any)
			typeName, _ := params["type"].(string)
			payload, _ := params["payload"].(map[string]any)
			if typeName == "reasoning.delta" || typeName == "thinking.delta" || typeName == "message.delta" || typeName == "" {
				continue
			}
			event := runtimeWorkEvent{Sequence: *sequence, Type: typeName, Payload: payload, OccurredAt: time.Now().UTC().Format(time.RFC3339Nano)}
			if executor.appendEvent(ctx, run, profile, event) == nil {
				*sequence++
			}
			if interventionType := interventionTypeForEvent(typeName); interventionType != "" {
				requestID := firstString(payload, "request_id", "requestId", "id")
				if requestID == "" {
					requestID = fmt.Sprintf("%s-%d", interventionType, event.Sequence)
				}
				_ = executor.createIntervention(ctx, run, profile, requestID, interventionType, firstString(payload, "prompt", "question", "message"), payload)
			}
			switch typeName {
			case "message.complete":
				return summarizeMessage(payload), "succeeded", ""
			case "error":
				return "", "failed", firstString(payload, "code", "message", "error")
			}
		}
	}
}

func (executor *WorkExecutor) heartbeat(ctx context.Context, run claimedWorkRun, profile string) ([]workCommand, error) {
	var response struct {
		Commands []workCommand `json:"commands"`
	}
	err := executor.post(ctx, workRunPath(gatewaycontracts.Spec.Work.Paths.RunHeartbeat, run.RunID), profile, map[string]any{
		"installationId": executor.runInstallationID(run),
		"leaseToken":     run.LeaseToken,
	}, &response)
	return response.Commands, err
}

// Materialization can transfer up to the configured total quota before the run
// reaches /start. Renew the already-authenticated claim lease during that
// staging window so a valid large input cannot expire and be claimed twice.
// Commands are intentionally left for the normal post-start loop: before a
// Hermes session exists there is nowhere safe to apply an intervention.
func (executor *WorkExecutor) stagingHeartbeatLoop(ctx context.Context, run claimedWorkRun, profile string) {
	interval := executor.config.WorkHeartbeatInterval
	if interval < time.Second {
		interval = time.Second
	}
	if interval > 10*time.Second {
		interval = 10 * time.Second
	}
	for {
		if _, err := executor.heartbeat(ctx, run, profile); err != nil && ctx.Err() == nil {
			executor.logger.Warn("Work staging heartbeat failed", "runId", run.RunID, "error", err)
		}
		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

func (executor *WorkExecutor) heartbeatLoop(ctx context.Context, run claimedWorkRun, profile string, output chan<- workCommand) {
	interval := executor.config.WorkHeartbeatInterval
	if interval < time.Second {
		interval = time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			commands, err := executor.heartbeat(ctx, run, profile)
			if err != nil {
				executor.logger.Warn("Work heartbeat failed", "runId", run.RunID, "error", err)
				continue
			}
			for _, command := range commands {
				select {
				case output <- command:
				case <-ctx.Done():
					return
				}
			}
		}
	}
}

func (executor *WorkExecutor) appendEvent(ctx context.Context, run claimedWorkRun, profile string, event runtimeWorkEvent) error {
	return executor.post(ctx, workRunPath(gatewaycontracts.Spec.Work.Paths.RunEvents, run.RunID), profile, map[string]any{
		"installationId": executor.runInstallationID(run),
		"leaseToken":     run.LeaseToken,
		"events":         []runtimeWorkEvent{event},
	}, nil)
}

func (executor *WorkExecutor) createIntervention(ctx context.Context, run claimedWorkRun, profile, requestID, kind, prompt string, payload map[string]any) error {
	if prompt == "" {
		prompt = "Hermes demande une intervention humaine."
	}
	return executor.post(ctx, workRunPath(gatewaycontracts.Spec.Work.Paths.RunInterventions, run.RunID), profile, map[string]any{
		"installationId": executor.runInstallationID(run),
		"leaseToken":     run.LeaseToken,
		"requestId":      requestID,
		"type":           kind,
		"prompt":         prompt,
		"safePayload":    interventionSafePayload(kind, payload),
	}, nil)
}

func interventionSafePayload(kind string, payload map[string]any) map[string]any {
	if kind == "secret" || kind == "sudo" {
		return map[string]any{}
	}
	return payload
}

func (executor *WorkExecutor) complete(ctx context.Context, run claimedWorkRun, profile, status, result, failure string) error {
	return executor.post(ctx, workRunPath(gatewaycontracts.Spec.Work.Paths.RunComplete, run.RunID), profile, map[string]any{
		"installationId": executor.runInstallationID(run),
		"leaseToken":     run.LeaseToken,
		"status":         status,
		"resultSummary":  result,
		"failureReason":  failure,
	}, nil)
}

func (executor *WorkExecutor) release(ctx context.Context, run claimedWorkRun, reason string) {
	_ = executor.post(ctx, workRunPath(gatewaycontracts.Spec.Work.Paths.RunRelease, run.RunID), run.Profile, map[string]any{
		"installationId": executor.runInstallationID(run),
		"leaseToken":     run.LeaseToken,
		"reason":         reason,
	}, nil)
}

func workRunPath(template, runID string) string {
	return strings.ReplaceAll(template, "{runId}", url.PathEscape(runID))
}

func (executor *WorkExecutor) runInstallationID(run claimedWorkRun) string {
	if run.InstallationID != "" {
		return run.InstallationID
	}
	return executor.config.WorkInstallationID
}

func (executor *WorkExecutor) writeRPC(mu *sync.Mutex, connection *websocket.Conn, id int, method string, params map[string]any) {
	mu.Lock()
	defer mu.Unlock()
	_ = connection.WriteJSON(map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params})
}

func (executor *WorkExecutor) respondToIntervention(mu *sync.Mutex, connection *websocket.Conn, sessionID, profile string, command workCommand) {
	switch command.InterventionType {
	case "approval":
		choice := "deny"
		if command.Decision == "approved" {
			choice = "once"
		}
		executor.writeRPC(mu, connection, 9100, "approval.respond", map[string]any{"session_id": sessionID, "choice": choice, "all": false, "profile": profile})
	case "clarification":
		executor.writeRPC(mu, connection, 9101, "clarify.respond", map[string]any{"request_id": command.RequestID, "answer": firstString(command.Payload, "answer"), "profile": profile})
	case "sudo":
		executor.writeRPC(mu, connection, 9102, "sudo.respond", map[string]any{"request_id": command.RequestID, "password": firstString(command.Payload, "value"), "profile": profile})
	case "secret":
		executor.writeRPC(mu, connection, 9103, "secret.respond", map[string]any{"request_id": command.RequestID, "value": firstString(command.Payload, "value"), "profile": profile})
	}
}

func interventionTypeForEvent(event string) string {
	switch event {
	case "approval.request":
		return "approval"
	case "clarify.request":
		return "clarification"
	case "sudo.request":
		return "sudo"
	case "secret.request":
		return "secret"
	default:
		return ""
	}
}

func firstString(value map[string]any, keys ...string) string {
	for _, key := range keys {
		if text, ok := value[key].(string); ok && strings.TrimSpace(text) != "" {
			return text
		}
	}
	return ""
}

func summarizeMessage(payload map[string]any) string {
	if value := firstString(payload, "content", "text", "message", "result"); value != "" {
		return value
	}
	encoded, err := json.Marshal(payload)
	if err != nil || string(encoded) == "{}" {
		return "Exécution terminée."
	}
	if len(encoded) > 100_000 {
		encoded = encoded[:100_000]
	}
	return string(encoded)
}
