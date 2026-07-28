package gateway

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"
)

const testSecret = "a-test-secret-that-is-long-enough"

func makeTicket(t *testing.T, ticket Ticket, secret string) string {
	t.Helper()
	payload, err := json.Marshal(ticket)
	if err != nil {
		t.Fatal(err)
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func TestVerifyTicket(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	raw := makeTicket(t, Ticket{
		Version: 1, AgentID: "agent-1", InstallationID: "install-1",
		Profile: "agent.profile", Role: "member", IssuedAt: now.UnixMilli(), ExpiresAt: now.Add(time.Minute).UnixMilli(),
	}, testSecret)
	ticket, err := VerifyTicket(raw, testSecret, "install-1", now)
	if err != nil {
		t.Fatalf("expected valid ticket: %v", err)
	}
	if ticket.Profile != "agent.profile" {
		t.Fatalf("unexpected profile %q", ticket.Profile)
	}

	for name, mutate := range map[string]func(string) string{
		"signature": func(raw string) string { return raw + "x" },
		"installation": func(string) string {
			return makeTicket(t, Ticket{Version: 1, AgentID: "a", InstallationID: "other", Profile: "default", Role: "owner", IssuedAt: now.UnixMilli(), ExpiresAt: now.Add(time.Minute).UnixMilli()}, testSecret)
		},
		"expired": func(string) string {
			return makeTicket(t, Ticket{Version: 1, AgentID: "a", InstallationID: "install-1", Profile: "default", Role: "owner", IssuedAt: now.Add(-time.Minute).UnixMilli(), ExpiresAt: now.Add(-time.Second).UnixMilli()}, testSecret)
		},
		"too-long": func(string) string {
			return makeTicket(t, Ticket{Version: 1, AgentID: "a", InstallationID: "install-1", Profile: "default", Role: "owner", IssuedAt: now.UnixMilli(), ExpiresAt: now.Add(3 * time.Minute).UnixMilli()}, testSecret)
		},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := VerifyTicket(mutate(raw), testSecret, "install-1", now); err == nil {
				t.Fatal("expected ticket rejection")
			}
		})
	}
}

func TestVerifyServiceRequest(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	body := []byte(`{"value":true}`)
	request := httptest.NewRequest("POST", "http://gateway/v1/runtime/api/config?ignored=1", nil)
	timestamp := now.UnixMilli()
	request.Header.Set(serviceTimestampHeader, strconv.FormatInt(timestamp, 10))
	request.Header.Set(serviceProfileHeader, "profile-1")
	request.Header.Set(serviceInstallationHeader, "install-1")
	nonce := "0123456789abcdef0123456789abcdef"
	request.Header.Set(serviceNonceHeader, nonce)
	request.Header.Set(serviceSignatureHeader, ServiceSignature(testSecret, request.Method, request.URL.RequestURI(), timestamp, nonce, "profile-1", body))
	profile, err := VerifyServiceRequest(request, body, testSecret, "install-1", now)
	if err != nil || profile != "profile-1" {
		t.Fatalf("expected valid request, profile=%q error=%v", profile, err)
	}
	request.Header.Set(serviceSignatureHeader, "invalid")
	if _, err := VerifyServiceRequest(request, body, testSecret, "install-1", now); err == nil {
		t.Fatal("expected signature rejection")
	}
}

func TestReplayGuardRejectsReusedNonce(t *testing.T) {
	guard := NewReplayGuard()
	now := time.Now()
	if !guard.Accept("unique-nonce-0123456789", now) {
		t.Fatal("fresh nonce rejected")
	}
	if guard.Accept("unique-nonce-0123456789", now) {
		t.Fatal("replayed nonce accepted")
	}
	if !guard.Accept("unique-nonce-0123456789", now.Add(2*time.Minute)) {
		t.Fatal("expired nonce was not evicted")
	}
}

func TestInstallationSecretsAreIsolated(t *testing.T) {
	master := "master-secret-at-least-24-characters"
	if DeriveInstallationSecret(master, "service", "edge-a") == DeriveInstallationSecret(master, "service", "edge-b") {
		t.Fatal("installations share a derived secret")
	}
	if DeriveInstallationSecret(master, "service", "edge-a") == DeriveInstallationSecret(master, "ticket", "edge-a") {
		t.Fatal("service and ticket domains share a secret")
	}
}
