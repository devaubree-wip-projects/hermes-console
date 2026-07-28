package gateway

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type RelayIdentity struct {
	Version         int    `json:"version"`
	TenantID        string `json:"tenantId"`
	InstallationID  string `json:"installationId"`
	InstallationKey string `json:"installationKey"`
	Fingerprint     string `json:"fingerprint"`
	ExpiresAt       int64  `json:"exp"`
}

func VerifyRelayIdentity(raw, secret string, certificateRaw []byte, now time.Time) (RelayIdentity, error) {
	payload, signature, ok := strings.Cut(raw, ".")
	if !ok || payload == "" || signature == "" {
		return RelayIdentity{}, errors.New("malformed relay identity")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(signature)) {
		return RelayIdentity{}, errors.New("invalid relay identity signature")
	}
	decoded, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return RelayIdentity{}, errors.New("invalid relay identity encoding")
	}
	var identity RelayIdentity
	if json.Unmarshal(decoded, &identity) != nil || identity.Version != 1 || identity.TenantID == "" || identity.InstallationID == "" || !validProfile(identity.InstallationKey) || identity.ExpiresAt <= now.UnixMilli() {
		return RelayIdentity{}, errors.New("expired or incomplete relay identity")
	}
	fingerprint := sha256.Sum256(certificateRaw)
	if !hmac.Equal([]byte(identity.Fingerprint), []byte(hex.EncodeToString(fingerprint[:]))) {
		return RelayIdentity{}, errors.New("relay identity certificate mismatch")
	}
	return identity, nil
}
