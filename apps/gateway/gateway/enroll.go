package gateway

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"time"
)

const (
	identityCertificateFile   = "client.crt"
	identityPrivateKeyFile    = "client.key"
	identityCredentialFile    = "credential"
	identityMetadataFile      = "identity.json"
	identityServiceSecretFile = "service-secret"
	identityTicketSecretFile  = "ticket-secret"
)

type EnrollmentBundle struct {
	InstallationID  string `json:"installationId"`
	TenantID        string `json:"tenantId"`
	InstallationKey string `json:"installationKey,omitempty"`
	// Empty for an Edge reachable on its own URL: enrolment establishes an identity,
	// it does not require an outbound Relay tunnel.
	RelayURL        string `json:"relayUrl,omitempty"`
	ControlPlaneURL string `json:"controlPlaneUrl,omitempty"`
	Credential      string `json:"-"`
	ServiceSecret   string `json:"-"`
	TicketSecret    string `json:"-"`
}

type enrollmentResponse struct {
	InstallationID      string `json:"installationId"`
	TenantID            string `json:"tenantId"`
	InstallationKey     string `json:"installationKey"`
	Credential          string `json:"credential"`
	CredentialExpiresAt string `json:"credentialExpiresAt"`
	RelayURL            string `json:"relayUrl"`
	ControlPlaneURL     string `json:"controlPlaneUrl"`
	ServiceSecret       string `json:"serviceSecret"`
	TicketSecret        string `json:"ticketSecret"`
}

func generateEdgeCertificate(now time.Time) (certificatePEM, privateKeyPEM []byte, err error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	serialLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serial, err := rand.Int(rand.Reader, serialLimit)
	if err != nil {
		return nil, nil, err
	}
	template := &x509.Certificate{
		SerialNumber: serial, Subject: pkix.Name{CommonName: "hermes-edge"},
		NotBefore: now.Add(-5 * time.Minute), NotAfter: now.Add(31 * 24 * time.Hour),
		KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
	}
	raw, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		return nil, nil, err
	}
	encodedKey, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return nil, nil, err
	}
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: raw}), pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: encodedKey}), nil
}

func EnrollEdge(ctx context.Context, endpoint, token, identityDir string, client *http.Client) (EnrollmentBundle, error) {
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		return EnrollmentBundle{}, errors.New("enrollment URL must be absolute HTTP(S)")
	}
	if parsed.Scheme == "http" {
		host := parsed.Hostname()
		address := net.ParseIP(host)
		if host != "localhost" && (address == nil || !address.IsLoopback()) {
			return EnrollmentBundle{}, errors.New("enrollment URL must use HTTPS outside loopback")
		}
	}
	if token == "" {
		return EnrollmentBundle{}, errors.New("enrollment token is required")
	}
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	if err := os.MkdirAll(identityDir, 0o700); err != nil {
		return EnrollmentBundle{}, err
	}
	for _, name := range []string{identityCertificateFile, identityPrivateKeyFile, identityCredentialFile, identityMetadataFile, identityServiceSecretFile, identityTicketSecretFile} {
		if _, statErr := os.Stat(filepath.Join(identityDir, name)); statErr == nil {
			return EnrollmentBundle{}, errors.New("identity directory already contains an enrollment; rotate explicitly")
		} else if !errors.Is(statErr, os.ErrNotExist) {
			return EnrollmentBundle{}, statErr
		}
	}
	certificate, privateKey, err := generateEdgeCertificate(time.Now())
	if err != nil {
		return EnrollmentBundle{}, err
	}
	payload, _ := json.Marshal(map[string]string{"token": token, "certificatePem": string(certificate)})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return EnrollmentBundle{}, err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return EnrollmentBundle{}, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		message, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return EnrollmentBundle{}, fmt.Errorf("enrollment rejected (%d): %s", response.StatusCode, string(message))
	}
	var result enrollmentResponse
	if json.NewDecoder(io.LimitReader(response.Body, 64<<10)).Decode(&result) != nil || result.InstallationID == "" || !validProfile(result.InstallationKey) || result.TenantID == "" || len(result.ServiceSecret) < 24 || len(result.TicketSecret) < 24 {
		return EnrollmentBundle{}, errors.New("invalid enrollment response")
	}
	// A direct-transport installation is reached on its own URL and has no Relay to
	// dial, hence no relay URL and no bearer credential. Both stay mandatory together
	// when a Relay is involved: a tunnel without a credential would fail at connect
	// time, far from the cause.
	relayURLValue := ""
	if result.RelayURL != "" {
		relayURL, err := parseAbsoluteURL(result.RelayURL, "wss")
		if err != nil {
			return EnrollmentBundle{}, errors.New("enrollment returned an invalid secure Relay URL")
		}
		if result.Credential == "" {
			return EnrollmentBundle{}, errors.New("enrollment returned a Relay URL without a credential")
		}
		relayURLValue = relayURL.String()
	}
	controlPlaneURL, err := parseOptionalAbsoluteURL(result.ControlPlaneURL, "http", "https")
	if err != nil {
		return EnrollmentBundle{}, errors.New("enrollment returned an invalid control plane URL")
	}
	metadata := EnrollmentBundle{InstallationID: result.InstallationID, TenantID: result.TenantID, InstallationKey: result.InstallationKey, RelayURL: relayURLValue}
	if controlPlaneURL != nil {
		metadata.ControlPlaneURL = controlPlaneURL.String()
	}
	metadataJSON, _ := json.MarshalIndent(metadata, "", "  ")
	temporary := identityDir + fmt.Sprintf(".enrolling-%d", os.Getpid())
	if err := os.Mkdir(temporary, 0o700); err != nil {
		return EnrollmentBundle{}, err
	}
	defer os.RemoveAll(temporary)
	files := []struct {
		name string
		data []byte
		mode os.FileMode
	}{
		{identityCertificateFile, certificate, 0o600}, {identityPrivateKeyFile, privateKey, 0o600},
		{identityCredentialFile, []byte(result.Credential + "\n"), 0o600}, {identityMetadataFile, append(metadataJSON, '\n'), 0o600},
		{identityServiceSecretFile, []byte(result.ServiceSecret + "\n"), 0o600}, {identityTicketSecretFile, []byte(result.TicketSecret + "\n"), 0o600},
	}
	for _, file := range files {
		if err := os.WriteFile(filepath.Join(temporary, file.name), file.data, file.mode); err != nil {
			return EnrollmentBundle{}, err
		}
	}
	for _, file := range files {
		if err := os.Rename(filepath.Join(temporary, file.name), filepath.Join(identityDir, file.name)); err != nil {
			return EnrollmentBundle{}, err
		}
	}
	metadata.Credential = result.Credential
	metadata.ServiceSecret = result.ServiceSecret
	metadata.TicketSecret = result.TicketSecret
	return metadata, nil
}

func LoadEnrollmentBundle(identityDir string) (EnrollmentBundle, error) {
	metadata, err := os.ReadFile(filepath.Join(identityDir, identityMetadataFile))
	if err != nil {
		return EnrollmentBundle{}, err
	}
	var bundle EnrollmentBundle
	if json.Unmarshal(metadata, &bundle) != nil || bundle.InstallationID == "" || !validProfile(bundle.InstallationKey) {
		return EnrollmentBundle{}, errors.New("invalid enrollment identity metadata")
	}
	credential, err := os.ReadFile(filepath.Join(identityDir, identityCredentialFile))
	if err != nil {
		return EnrollmentBundle{}, err
	}
	bundle.Credential = string(bytes.TrimSpace(credential))
	// Only a Relay bundle needs a bearer credential. Demanding one from a direct
	// bundle would stop an already-enrolled Edge from ever starting again, which is
	// why this check follows the transport rather than leading it.
	if bundle.RelayURL != "" && bundle.Credential == "" {
		return EnrollmentBundle{}, errors.New("empty relay credential")
	}
	serviceSecret, err := os.ReadFile(filepath.Join(identityDir, identityServiceSecretFile))
	if err != nil {
		return EnrollmentBundle{}, err
	}
	ticketSecret, err := os.ReadFile(filepath.Join(identityDir, identityTicketSecretFile))
	if err != nil {
		return EnrollmentBundle{}, err
	}
	bundle.ServiceSecret = string(bytes.TrimSpace(serviceSecret))
	bundle.TicketSecret = string(bytes.TrimSpace(ticketSecret))
	if len(bundle.ServiceSecret) < 24 || len(bundle.TicketSecret) < 24 {
		return EnrollmentBundle{}, errors.New("invalid installation-scoped secrets")
	}
	return bundle, nil
}
