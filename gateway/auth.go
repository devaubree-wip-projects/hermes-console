package gateway

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Ticket struct {
	Version        int    `json:"version"`
	UserID         string `json:"userId"`
	TenantID       string `json:"tenantId"`
	WorkspaceID    string `json:"workspaceId"`
	AgentID        string `json:"agentId"`
	InstallationID string `json:"installationId"`
	Profile        string `json:"profile"`
	Role           string `json:"role"`
	ModelOverride  string `json:"modelOverride,omitempty"`
	ExpiresAt      int64  `json:"exp"`
	IssuedAt       int64  `json:"iat"`
}

func VerifyTicket(raw, secret, installationID string, now time.Time) (Ticket, error) {
	encoded, signature, ok := strings.Cut(raw, ".")
	if !ok || encoded == "" || signature == "" {
		return Ticket{}, errors.New("malformed ticket")
	}
	expected := signBase64URL(secret, encoded)
	if !hmac.Equal([]byte(expected), []byte(signature)) {
		return Ticket{}, errors.New("invalid ticket signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return Ticket{}, errors.New("invalid ticket encoding")
	}
	var ticket Ticket
	if err := json.Unmarshal(payload, &ticket); err != nil {
		return Ticket{}, errors.New("invalid ticket payload")
	}
	if ticket.Version != 1 || ticket.ExpiresAt <= now.UnixMilli() {
		return Ticket{}, errors.New("expired or unsupported ticket")
	}
	if ticket.IssuedAt <= 0 || ticket.IssuedAt > now.Add(5*time.Second).UnixMilli() || ticket.ExpiresAt <= ticket.IssuedAt || ticket.ExpiresAt-ticket.IssuedAt > int64(2*time.Minute/time.Millisecond) {
		return Ticket{}, errors.New("invalid ticket lifetime")
	}
	if ticket.AgentID == "" || !validProfile(ticket.Profile) || !validRole(ticket.Role) {
		return Ticket{}, errors.New("incomplete ticket")
	}
	if len(ticket.ModelOverride) > 200 {
		return Ticket{}, errors.New("invalid model override")
	}
	if installationID != "" && ticket.InstallationID != installationID {
		return Ticket{}, errors.New("ticket belongs to another installation")
	}
	return ticket, nil
}

func signBase64URL(secret, encoded string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(encoded))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

const (
	serviceTimestampHeader    = "X-Hermes-Timestamp"
	serviceSignatureHeader    = "X-Hermes-Signature"
	serviceProfileHeader      = "X-Hermes-Profile"
	serviceInstallationHeader = "X-Hermes-Installation-Id"
	serviceNonceHeader        = "X-Hermes-Nonce"
)

func VerifyServiceRequest(r *http.Request, body []byte, secret, installationID string, now time.Time) (string, error) {
	profile := r.Header.Get(serviceProfileHeader)
	if !validProfile(profile) {
		return "", errors.New("invalid profile")
	}
	if installationID != "" && r.Header.Get(serviceInstallationHeader) != installationID {
		return "", errors.New("installation mismatch")
	}
	timestamp, err := strconv.ParseInt(r.Header.Get(serviceTimestampHeader), 10, 64)
	if err != nil || timestamp <= 0 {
		return "", errors.New("invalid timestamp")
	}
	requestedAt := time.UnixMilli(timestamp)
	if delta := now.Sub(requestedAt); delta > 30*time.Second || delta < -30*time.Second {
		return "", errors.New("stale request")
	}
	nonce := r.Header.Get(serviceNonceHeader)
	if len(nonce) < 16 || len(nonce) > 128 {
		return "", errors.New("invalid nonce")
	}
	expected := ServiceSignature(secret, r.Method, r.URL.RequestURI(), timestamp, nonce, profile, body)
	provided := r.Header.Get(serviceSignatureHeader)
	if provided == "" || !hmac.Equal([]byte(expected), []byte(provided)) {
		return "", errors.New("invalid service signature")
	}
	return profile, nil
}

func ServiceSignature(secret, method, requestURI string, timestamp int64, nonce, profile string, body []byte) string {
	digest := sha256.Sum256(body)
	canonical := fmt.Sprintf("%s\n%s\n%d\n%s\n%s\n%s", strings.ToUpper(method), requestURI, timestamp, nonce, profile, hex.EncodeToString(digest[:]))
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(canonical))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func DeriveInstallationSecret(master, purpose, installationKey string) string {
	mac := hmac.New(sha256.New, []byte(master))
	_, _ = mac.Write([]byte("hermes-console:" + purpose + ":" + installationKey))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

type ReplayGuard struct {
	mu   sync.Mutex
	seen map[string]time.Time
}

func NewReplayGuard() *ReplayGuard { return &ReplayGuard{seen: make(map[string]time.Time)} }

func (guard *ReplayGuard) Accept(nonce string, now time.Time) bool {
	guard.mu.Lock()
	defer guard.mu.Unlock()
	for value, expiresAt := range guard.seen {
		if !expiresAt.After(now) {
			delete(guard.seen, value)
		}
	}
	if _, exists := guard.seen[nonce]; exists {
		return false
	}
	guard.seen[nonce] = now.Add(time.Minute)
	return true
}

func validProfile(profile string) bool {
	if profile == "default" {
		return true
	}
	if len(profile) < 1 || len(profile) > 128 {
		return false
	}
	for i, char := range profile {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || (i > 0 && strings.ContainsRune("._-", char)) {
			continue
		}
		return false
	}
	return true
}

func validRole(role string) bool {
	return role == "owner" || role == "member" || role == "viewer"
}
