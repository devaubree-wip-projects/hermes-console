package gateway

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Mode                         string
	ListenAddress                string
	RuntimeHTTPURL               *url.URL
	RuntimeWSURL                 *url.URL
	RuntimeToken                 string
	TicketSecret                 string
	ServiceSecret                string
	DeriveSecrets                bool
	InstallationID               string
	RuntimeKind                  string
	AllowedOrigins               map[string]struct{}
	HermesHome                   string
	SessionDebounce              time.Duration
	SessionReconcile             time.Duration
	UpstreamTimeout              time.Duration
	MaxRequestBodySize           int64
	ControlMode                  string
	HermesCLI                    string
	RelayURL                     *url.URL
	RelayPublicURL               string
	RelayIdentitySecret          string
	RelayCredential              string
	RelayClientCert              string
	RelayClientKey               string
	RelayServerCert              string
	RelayServerKey               string
	RelayServerCA                string
	EdgeLocalURL                 *url.URL
	RelayMaxConnections          int
	RelayMaxConnectionsPerTenant int
	RelayMaxFrameBytes           int64
	RelayRevocationFile          string
	BackupDirectory              string
	BackupEncryptionKey          string
	BackupRestoreEnabled         bool
	UpgradeExecutable            string
	AllowedVersions              map[string]struct{}
}

func LoadConfig() (Config, error) {
	mode := strings.ToLower(env("HERMES_GATEWAY_MODE", "edge"))
	if mode != "edge" && mode != "relay" {
		return Config{}, fmt.Errorf("HERMES_GATEWAY_MODE must be edge or relay")
	}
	environment := strings.ToLower(env("HERMES_GATEWAY_ENV", "development"))
	if environment != "development" && environment != "production" {
		return Config{}, fmt.Errorf("HERMES_GATEWAY_ENV must be development or production")
	}
	runtimeHTTP, err := parseAbsoluteURL(env("HERMES_RUNTIME_URL", "http://127.0.0.1:9119"), "http", "https")
	if err != nil {
		return Config{}, fmt.Errorf("HERMES_RUNTIME_URL: %w", err)
	}
	runtimeWSDefault := *runtimeHTTP
	if runtimeWSDefault.Scheme == "https" {
		runtimeWSDefault.Scheme = "wss"
	} else {
		runtimeWSDefault.Scheme = "ws"
	}
	runtimeWSDefault.Path = "/api/ws"
	runtimeWS, err := parseAbsoluteURL(env("HERMES_RUNTIME_WS", runtimeWSDefault.String()), "ws", "wss")
	if err != nil {
		return Config{}, fmt.Errorf("HERMES_RUNTIME_WS: %w", err)
	}

	explicitTicketSecret := strings.TrimSpace(os.Getenv("HERMES_GATEWAY_TICKET_SECRET"))
	explicitServiceSecret := strings.TrimSpace(os.Getenv("HERMES_GATEWAY_SERVICE_SECRET"))
	explicitRelayIdentitySecret := strings.TrimSpace(os.Getenv("HERMES_RELAY_IDENTITY_SECRET"))
	ticketSecret := explicitTicketSecret
	if ticketSecret == "" {
		ticketSecret = "hermes-console-local-development"
	}
	serviceSecret := explicitServiceSecret
	if serviceSecret == "" {
		serviceSecret = ticketSecret
	}
	relayIdentitySecret := explicitRelayIdentitySecret
	if relayIdentitySecret == "" {
		relayIdentitySecret = serviceSecret
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return Config{}, fmt.Errorf("resolve home directory: %w", err)
	}
	identityDir := env("HERMES_IDENTITY_DIR", filepath.Join(home, ".hermes-console", "identity"))
	relayURLRaw := strings.TrimSpace(os.Getenv("HERMES_RELAY_URL"))
	relayCredential := strings.TrimSpace(os.Getenv("HERMES_RELAY_CREDENTIAL"))
	installationID := env("HERMES_INSTALLATION_ID", "local-default")
	clientCertificate := strings.TrimSpace(os.Getenv("HERMES_RELAY_CLIENT_CERT"))
	clientKey := strings.TrimSpace(os.Getenv("HERMES_RELAY_CLIENT_KEY"))
	enrolledIdentity := false
	if bundle, bundleErr := LoadEnrollmentBundle(identityDir); mode == "edge" && bundleErr == nil {
		enrolledIdentity = true
		if relayURLRaw == "" {
			relayURLRaw = bundle.RelayURL
		}
		if relayCredential == "" {
			relayCredential = bundle.Credential
		}
		if os.Getenv("HERMES_INSTALLATION_ID") == "" {
			installationID = bundle.InstallationKey
		}
		if clientCertificate == "" {
			clientCertificate = filepath.Join(identityDir, identityCertificateFile)
		}
		if clientKey == "" {
			clientKey = filepath.Join(identityDir, identityPrivateKeyFile)
		}
		serviceSecret = bundle.ServiceSecret
		ticketSecret = bundle.TicketSecret
	} else if mode == "edge" && !errors.Is(bundleErr, os.ErrNotExist) {
		return Config{}, fmt.Errorf("load enrolled identity: %w", bundleErr)
	}
	if environment == "production" {
		if mode == "edge" && !enrolledIdentity && (explicitTicketSecret == "" || explicitServiceSecret == "") {
			return Config{}, fmt.Errorf("HERMES_GATEWAY_TICKET_SECRET and HERMES_GATEWAY_SERVICE_SECRET must be set explicitly in production")
		}
		if mode == "relay" && (explicitServiceSecret == "" || explicitRelayIdentitySecret == "") {
			return Config{}, fmt.Errorf("HERMES_GATEWAY_SERVICE_SECRET and HERMES_RELAY_IDENTITY_SECRET must be set explicitly for a production Relay")
		}
	}
	if len(ticketSecret) < 24 || len(serviceSecret) < 24 {
		return Config{}, fmt.Errorf("gateway secrets must contain at least 24 characters")
	}
	if len(relayIdentitySecret) < 24 {
		return Config{}, fmt.Errorf("HERMES_RELAY_IDENTITY_SECRET must contain at least 24 characters")
	}
	relayURL, err := parseOptionalAbsoluteURL(relayURLRaw, "ws", "wss")
	if err != nil {
		return Config{}, fmt.Errorf("HERMES_RELAY_URL: %w", err)
	}
	edgeLocalURL, err := parseAbsoluteURL(env("HERMES_EDGE_LOCAL_URL", "http://127.0.0.1:8787"), "http", "https")
	if err != nil {
		return Config{}, fmt.Errorf("HERMES_EDGE_LOCAL_URL: %w", err)
	}

	deriveSecrets := mode == "edge" && !enrolledIdentity && strings.EqualFold(env("HERMES_GATEWAY_DERIVE_SECRETS", "true"), "true")
	if deriveSecrets {
		serviceSecret = DeriveInstallationSecret(serviceSecret, "service", installationID)
		ticketSecret = DeriveInstallationSecret(ticketSecret, "ticket", installationID)
	}
	return Config{
		Mode:                         mode,
		ListenAddress:                env("HERMES_GATEWAY_LISTEN", "127.0.0.1:8787"),
		RuntimeHTTPURL:               runtimeHTTP,
		RuntimeWSURL:                 runtimeWS,
		RuntimeToken:                 env("HERMES_DASHBOARD_SESSION_TOKEN", env("HERMES_RUNTIME_TOKEN", "hermes-console-local-runtime")),
		TicketSecret:                 ticketSecret,
		ServiceSecret:                serviceSecret,
		DeriveSecrets:                deriveSecrets,
		InstallationID:               installationID,
		RuntimeKind:                  runtimeKind(env("HERMES_RUNTIME_KIND", "unknown")),
		AllowedOrigins:               csvSet(env("HERMES_ALLOWED_ORIGINS", "http://127.0.0.1:3010,http://localhost:3010")),
		HermesHome:                   env("HERMES_HOME", filepath.Join(home, ".hermes")),
		SessionDebounce:              durationMS("HERMES_SESSION_CHANGE_DEBOUNCE_MS", 200),
		SessionReconcile:             durationMS("HERMES_SESSION_RECONCILE_MS", 0),
		UpstreamTimeout:              durationMS("HERMES_UPSTREAM_TIMEOUT_MS", 5_000),
		MaxRequestBodySize:           int64Value("HERMES_GATEWAY_MAX_BODY_BYTES", 2<<20),
		ControlMode:                  env("HERMES_GATEWAY_CONTROL_MODE", "cli"),
		HermesCLI:                    env("HERMES_CLI_PATH", "hermes"),
		RelayURL:                     relayURL,
		RelayPublicURL:               env("HERMES_RELAY_PUBLIC_URL", "https://127.0.0.1:8790"),
		RelayIdentitySecret:          relayIdentitySecret,
		RelayCredential:              relayCredential,
		RelayClientCert:              clientCertificate,
		RelayClientKey:               clientKey,
		RelayServerCert:              strings.TrimSpace(os.Getenv("HERMES_RELAY_SERVER_CERT")),
		RelayServerKey:               strings.TrimSpace(os.Getenv("HERMES_RELAY_SERVER_KEY")),
		RelayServerCA:                strings.TrimSpace(os.Getenv("HERMES_RELAY_SERVER_CA")),
		EdgeLocalURL:                 edgeLocalURL,
		RelayMaxConnections:          int(int64Value("HERMES_RELAY_MAX_CONNECTIONS", 1024)),
		RelayMaxConnectionsPerTenant: int(int64Value("HERMES_RELAY_MAX_CONNECTIONS_PER_TENANT", 128)),
		RelayMaxFrameBytes:           int64Value("HERMES_RELAY_MAX_FRAME_BYTES", 4<<20),
		RelayRevocationFile:          strings.TrimSpace(os.Getenv("HERMES_RELAY_REVOCATION_FILE")),
		BackupDirectory:              strings.TrimSpace(os.Getenv("HERMES_BACKUP_DIR")),
		BackupEncryptionKey:          strings.TrimSpace(os.Getenv("HERMES_BACKUP_ENCRYPTION_KEY")),
		BackupRestoreEnabled:         strings.EqualFold(strings.TrimSpace(os.Getenv("HERMES_BACKUP_RESTORE_ENABLED")), "true"),
		UpgradeExecutable:            strings.TrimSpace(os.Getenv("HERMES_UPGRADE_EXECUTABLE")),
		AllowedVersions:              csvSet(os.Getenv("HERMES_ALLOWED_VERSIONS")),
	}, nil
}

func parseOptionalAbsoluteURL(raw string, schemes ...string) (*url.URL, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	return parseAbsoluteURL(raw, schemes...)
}

func runtimeKind(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "docker", "systemwide":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "unknown"
	}
}

func parseAbsoluteURL(raw string, schemes ...string) (*url.URL, error) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return nil, fmt.Errorf("expected an absolute URL")
	}
	for _, scheme := range schemes {
		if parsed.Scheme == scheme {
			parsed.Path = strings.TrimSuffix(parsed.Path, "/")
			return parsed, nil
		}
	}
	return nil, fmt.Errorf("unsupported scheme %q", parsed.Scheme)
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func csvSet(raw string) map[string]struct{} {
	values := make(map[string]struct{})
	for _, value := range strings.Split(raw, ",") {
		if value = strings.TrimSpace(value); value != "" {
			values[value] = struct{}{}
		}
	}
	return values
}

func durationMS(key string, fallback int64) time.Duration {
	value := int64Value(key, fallback)
	if value < 0 {
		value = fallback
	}
	return time.Duration(value) * time.Millisecond
}

func int64Value(key string, fallback int64) int64 {
	value, err := strconv.ParseInt(strings.TrimSpace(os.Getenv(key)), 10, 64)
	if err != nil {
		return fallback
	}
	return value
}
