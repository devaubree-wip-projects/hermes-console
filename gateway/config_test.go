package gateway

import (
	"strings"
	"testing"
)

func TestProductionConfigRejectsDevelopmentSecrets(t *testing.T) {
	t.Setenv("HERMES_GATEWAY_ENV", "production")
	t.Setenv("HERMES_GATEWAY_MODE", "edge")
	t.Setenv("HERMES_IDENTITY_DIR", t.TempDir())
	t.Setenv("HERMES_GATEWAY_TICKET_SECRET", "")
	t.Setenv("HERMES_GATEWAY_SERVICE_SECRET", "")

	_, err := LoadConfig()
	if err == nil || !strings.Contains(err.Error(), "set explicitly in production") {
		t.Fatalf("production accepted development secrets: %v", err)
	}
}

func TestProductionConfigAcceptsExplicitEdgeSecrets(t *testing.T) {
	t.Setenv("HERMES_GATEWAY_ENV", "production")
	t.Setenv("HERMES_GATEWAY_MODE", "edge")
	t.Setenv("HERMES_IDENTITY_DIR", t.TempDir())
	t.Setenv("HERMES_GATEWAY_TICKET_SECRET", "production-ticket-secret-at-least-24-characters")
	t.Setenv("HERMES_GATEWAY_SERVICE_SECRET", "production-service-secret-at-least-24-characters")

	if _, err := LoadConfig(); err != nil {
		t.Fatalf("explicit production configuration rejected: %v", err)
	}
}

func TestProductionRelayRequiresDedicatedIdentitySecret(t *testing.T) {
	t.Setenv("HERMES_GATEWAY_ENV", "production")
	t.Setenv("HERMES_GATEWAY_MODE", "relay")
	t.Setenv("HERMES_GATEWAY_TICKET_SECRET", "production-ticket-secret-at-least-24-characters")
	t.Setenv("HERMES_GATEWAY_SERVICE_SECRET", "production-service-secret-at-least-24-characters")
	t.Setenv("HERMES_RELAY_IDENTITY_SECRET", "")

	if _, err := LoadConfig(); err == nil || !strings.Contains(err.Error(), "production Relay") {
		t.Fatalf("production Relay accepted an implicit identity secret: %v", err)
	}
}
