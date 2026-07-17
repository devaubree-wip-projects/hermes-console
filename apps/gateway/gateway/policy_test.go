package gateway

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestScopeRPCForcesProfileAndViewerPolicy(t *testing.T) {
	frame, forward, err := scopeRPC([]byte(`{"jsonrpc":"2.0","id":1,"method":"session.list","params":{"profile":"attacker"}}`), Ticket{Profile: "allowed", Role: "viewer"})
	if err != nil || !forward {
		t.Fatalf("expected frame to be forwarded: %v", err)
	}
	var request rpcRequest
	if err := json.Unmarshal(frame, &request); err != nil {
		t.Fatal(err)
	}
	if request.Params["profile"] != "allowed" {
		t.Fatalf("profile was not forced: %#v", request.Params)
	}

	frame, forward, err = scopeRPC([]byte(`{"jsonrpc":"2.0","id":2,"method":"chat.send","params":{}}`), Ticket{Profile: "allowed", Role: "viewer"})
	if err != nil || forward {
		t.Fatalf("expected local RBAC rejection: forward=%v error=%v", forward, err)
	}
	var rejected map[string]any
	_ = json.Unmarshal(frame, &rejected)
	if rejected["error"] == nil {
		t.Fatalf("missing JSON-RPC error: %s", frame)
	}
}

func TestRuntimeRouteAllowlist(t *testing.T) {
	allowed := [][2]string{
		{http.MethodGet, "/api/status"},
		{http.MethodPost, "/api/config"},
		{http.MethodPut, "/api/config"},
		{http.MethodGet, "/api/skills"},
		{http.MethodPost, "/api/skills"},
		{http.MethodGet, "/api/skills/content"},
		{http.MethodPut, "/api/skills/content"},
		{http.MethodPut, "/api/skills/toggle"},
		{http.MethodGet, "/api/sessions/id/history"},
		// `/api/env` is covered by both a GET-only rule and a PUT/DELETE rule;
		// all three must be allowed (the GET rule must not shadow the writes).
		{http.MethodGet, "/api/env"},
		{http.MethodPut, "/api/env"},
		{http.MethodDelete, "/api/env"},
	}
	for _, route := range allowed {
		if !allowedRuntimeRoute(route[0], route[1]) {
			t.Errorf("expected route to be allowed: %s %s", route[0], route[1])
		}
	}
	rejected := [][2]string{{http.MethodDelete, "/api/config"}, {http.MethodGet, "/api/internal/secrets"}, {http.MethodPost, "/api/sessions"}, {http.MethodDelete, "/api/skills"}, {http.MethodPost, "/api/skills/content"}}
	for _, route := range rejected {
		if allowedRuntimeRoute(route[0], route[1]) {
			t.Errorf("expected route to be rejected: %s %s", route[0], route[1])
		}
	}
}

func TestScopeRPCForcesHardCapFallbackModel(t *testing.T) {
	frame, forward, err := scopeRPC([]byte(`{"jsonrpc":"2.0","id":1,"method":"session.create","params":{"model":"expensive"}}`), Ticket{Profile: "allowed", Role: "member", ModelOverride: "fallback-safe"})
	if err != nil || !forward {
		t.Fatalf("fallback request rejected: %v", err)
	}
	var scoped rpcRequest
	if json.Unmarshal(frame, &scoped) != nil || scoped.Params["model"] != "fallback-safe" {
		t.Fatalf("fallback model was not forced: %s", frame)
	}
}
