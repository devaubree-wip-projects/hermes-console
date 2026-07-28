package gateway

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEnrollEdgePersistsPrivateIdentityWithRestrictivePermissions(t *testing.T) {
	var received struct {
		Token          string `json:"token"`
		CertificatePEM string `json:"certificatePem"`
	}
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("unexpected method %s", r.Method)
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatal(err)
		}
		writeJSON(w, http.StatusOK, enrollmentResponse{
			InstallationID: "installation-a", TenantID: "tenant-a", InstallationKey: "edge-a",
			Credential: "opaque.signed", CredentialExpiresAt: "2026-08-15T00:00:00Z",
			RelayURL:        "wss://relay.example.test/v1/relay/connect",
			ControlPlaneURL: "https://console.example.test",
			ServiceSecret:   "installation-service-secret-at-least-24", TicketSecret: "installation-ticket-secret-at-least-24",
		})
	}))
	defer server.Close()
	directory := filepath.Join(t.TempDir(), "identity")
	bundle, err := EnrollEdge(context.Background(), server.URL, "one-time-secret", directory, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	if received.Token != "one-time-secret" || received.CertificatePEM == "" {
		t.Fatalf("invalid exchange payload: %#v", received)
	}
	if bundle.InstallationKey != "edge-a" || bundle.Credential != "opaque.signed" || bundle.ControlPlaneURL != "https://console.example.test" {
		t.Fatalf("invalid bundle: %#v", bundle)
	}
	for _, name := range []string{identityCertificateFile, identityPrivateKeyFile, identityCredentialFile, identityMetadataFile, identityServiceSecretFile, identityTicketSecretFile} {
		metadata, statErr := os.Stat(filepath.Join(directory, name))
		if statErr != nil {
			t.Fatal(statErr)
		}
		if metadata.Mode().Perm() != 0o600 {
			t.Fatalf("%s permissions are %o", name, metadata.Mode().Perm())
		}
	}
	loaded, err := LoadEnrollmentBundle(directory)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Credential != "opaque.signed" || loaded.RelayURL != "wss://relay.example.test/v1/relay/connect" || loaded.ControlPlaneURL != "https://console.example.test" {
		t.Fatalf("invalid loaded identity: %#v", loaded)
	}
	if loaded.ServiceSecret != "installation-service-secret-at-least-24" || loaded.TicketSecret != "installation-ticket-secret-at-least-24" {
		t.Fatal("installation secrets were not loaded")
	}
	if _, err := EnrollEdge(context.Background(), server.URL, "another", directory, server.Client()); err == nil {
		t.Fatal("enrollment overwrote an existing identity")
	}
	certificate, err := tls.LoadX509KeyPair(filepath.Join(directory, identityCertificateFile), filepath.Join(directory, identityPrivateKeyFile))
	if err != nil || len(certificate.Certificate) != 1 {
		t.Fatalf("persisted mTLS keypair is invalid: %v", err)
	}
}

// A direct-transport Edge is reached on its own URL: the Console returns no Relay URL
// and no bearer credential. Enrolment must still establish the identity, otherwise the
// only way to own an installation-scoped secret would be to run a Relay.
func TestEnrollEdgeAcceptsDirectTransportWithoutRelay(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, enrollmentResponse{
			InstallationID: "installation-b", TenantID: "tenant-b", InstallationKey: "edge-b",
			ControlPlaneURL: "https://console.example.test",
			ServiceSecret:   "installation-service-secret-at-least-24", TicketSecret: "installation-ticket-secret-at-least-24",
		})
	}))
	defer server.Close()
	directory := filepath.Join(t.TempDir(), "identity")
	bundle, err := EnrollEdge(context.Background(), server.URL, "one-time-secret", directory, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	if bundle.RelayURL != "" || bundle.Credential != "" {
		t.Fatalf("direct enrollment invented a relay: %#v", bundle)
	}
	if bundle.ServiceSecret != "installation-service-secret-at-least-24" {
		t.Fatalf("installation secrets missing: %#v", bundle)
	}
	// Reloading is what happens on every restart: a bundle that cannot be re-read is
	// an Edge that never comes back up.
	loaded, err := LoadEnrollmentBundle(directory)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.RelayURL != "" || loaded.InstallationKey != "edge-b" || loaded.TicketSecret != "installation-ticket-secret-at-least-24" {
		t.Fatalf("invalid reloaded direct bundle: %#v", loaded)
	}
	// The metadata file must not carry an empty relayUrl either: config.go decides
	// whether to dial a Relay from its presence.
	metadata, err := os.ReadFile(filepath.Join(directory, identityMetadataFile))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(metadata), "relayUrl") {
		t.Fatalf("direct identity metadata still advertises a relay: %s", metadata)
	}
}

// A Relay tunnel without its bearer credential fails at connect time, far from the
// cause. The two travel together or not at all.
func TestEnrollEdgeRejectsRelayURLWithoutCredential(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, enrollmentResponse{
			InstallationID: "installation-c", TenantID: "tenant-c", InstallationKey: "edge-c",
			RelayURL:      "wss://relay.example.test/v1/relay/connect",
			ServiceSecret: "installation-service-secret-at-least-24", TicketSecret: "installation-ticket-secret-at-least-24",
		})
	}))
	defer server.Close()
	_, err := EnrollEdge(context.Background(), server.URL, "one-time-secret", filepath.Join(t.TempDir(), "identity"), server.Client())
	if err == nil || !strings.Contains(err.Error(), "credential") {
		t.Fatalf("relay enrollment without a credential accepted: %v", err)
	}
}

func TestEnrollEdgeRejectsPlainHTTPOutsideLoopback(t *testing.T) {
	_, err := EnrollEdge(context.Background(), "http://example.com/api/runtime/enroll", "one-time-token", t.TempDir(), nil)
	if err == nil || !strings.Contains(err.Error(), "HTTPS outside loopback") {
		t.Fatalf("insecure remote enrollment URL accepted: %v", err)
	}
}
