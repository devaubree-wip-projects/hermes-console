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
	RelayURL        string `json:"relayUrl"`
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
	if json.NewDecoder(io.LimitReader(response.Body, 64<<10)).Decode(&result) != nil || result.InstallationID == "" || !validProfile(result.InstallationKey) || result.TenantID == "" || result.Credential == "" || len(result.ServiceSecret) < 24 || len(result.TicketSecret) < 24 {
		return EnrollmentBundle{}, errors.New("invalid enrollment response")
	}
	relayURL, err := parseAbsoluteURL(result.RelayURL, "wss")
	if err != nil {
		return EnrollmentBundle{}, errors.New("enrollment returned an invalid secure Relay URL")
	}
	metadata := EnrollmentBundle{InstallationID: result.InstallationID, TenantID: result.TenantID, InstallationKey: result.InstallationKey, RelayURL: relayURL.String()}
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
	if json.Unmarshal(metadata, &bundle) != nil || bundle.InstallationID == "" || !validProfile(bundle.InstallationKey) || bundle.RelayURL == "" {
		return EnrollmentBundle{}, errors.New("invalid enrollment identity metadata")
	}
	credential, err := os.ReadFile(filepath.Join(identityDir, identityCredentialFile))
	if err != nil {
		return EnrollmentBundle{}, err
	}
	bundle.Credential = string(bytes.TrimSpace(credential))
	if bundle.Credential == "" {
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
