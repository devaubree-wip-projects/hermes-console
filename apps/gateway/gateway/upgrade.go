package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os/exec"
	"strings"
	"time"
)

func (server *Server) controlUpgrade(w http.ResponseWriter, r *http.Request) {
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
		Action        string `json:"action"`
		Profile       string `json:"profile"`
		TargetVersion string `json:"targetVersion"`
	}
	if json.Unmarshal(body, &command) != nil || command.Profile != profile || (command.Action != "preflight" && command.Action != "upgrade" && command.Action != "rollback") {
		http.Error(w, "invalid upgrade command", http.StatusBadRequest)
		return
	}
	if server.config.UpgradeExecutable == "" {
		http.Error(w, "upgrade executor is disabled", http.StatusNotImplemented)
		return
	}
	if _, allowed := server.config.AllowedVersions[command.TargetVersion]; !allowed {
		http.Error(w, "target version is not allowlisted", http.StatusForbidden)
		return
	}
	if err := executeUpgradeCommand(r.Context(), server.config.UpgradeExecutable, command.Action, command.TargetVersion, profile); err != nil {
		server.logger.Error("Upgrade executor failed", "action", command.Action, "targetVersion", command.TargetVersion, "error", err)
		http.Error(w, "upgrade executor failed", http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "action": command.Action, "targetVersion": command.TargetVersion})
}

func executeUpgradeCommand(ctx context.Context, executable, action, targetVersion, profile string) error {
	if executable == "" || !validProfile(profile) || (action != "preflight" && action != "upgrade" && action != "rollback") {
		return errors.New("invalid upgrade executor input")
	}
	commandContext, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	output, err := exec.CommandContext(commandContext, executable, action, "--version", targetVersion, "--profile", profile).CombinedOutput()
	if err != nil {
		return errors.New(strings.TrimSpace(string(output)))
	}
	return nil
}
