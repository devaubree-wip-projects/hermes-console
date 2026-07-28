package gateway

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
)

var viewerMethods = map[string]struct{}{
	"session.list": {}, "session.resume": {}, "session.most_recent": {}, "config.get": {},
}

type rpcRequest struct {
	JSONRPC string                 `json:"jsonrpc"`
	ID      any                    `json:"id"`
	Method  string                 `json:"method"`
	Params  map[string]interface{} `json:"params"`
}

func scopeRPC(raw []byte, ticket Ticket) ([]byte, bool, error) {
	var request rpcRequest
	if err := json.Unmarshal(raw, &request); err != nil || request.JSONRPC != "2.0" || request.Method == "" {
		return nil, false, errors.New("invalid JSON-RPC request")
	}
	if ticket.Role == "viewer" {
		if _, allowed := viewerMethods[request.Method]; !allowed {
			frame, _ := json.Marshal(map[string]any{
				"jsonrpc": "2.0", "id": request.ID,
				"error": map[string]any{"code": 4030, "message": "workspace is read-only"},
			})
			return frame, false, nil
		}
	}
	if request.Params == nil {
		request.Params = make(map[string]interface{})
	}
	request.Params["profile"] = ticket.Profile
	if ticket.ModelOverride != "" && (request.Method == "session.create" || request.Method == "session.send" || request.Method == "chat.send" || request.Method == "message.send") {
		request.Params["model"] = ticket.ModelOverride
	}
	frame, err := json.Marshal(request)
	return frame, true, err
}

type routeRule struct {
	methods map[string]struct{}
	path    *regexp.Regexp
}

func methods(values ...string) map[string]struct{} {
	set := make(map[string]struct{}, len(values))
	for _, value := range values {
		set[value] = struct{}{}
	}
	return set
}

var runtimeRoutes = []routeRule{
	{methods(http.MethodGet), regexp.MustCompile(`^/api/status$`)},
	{methods(http.MethodGet, http.MethodPost, http.MethodPut), regexp.MustCompile(`^/api/config$`)},
	{methods(http.MethodGet), regexp.MustCompile(`^/api/fs/default-cwd$`)},
	{methods(http.MethodGet), regexp.MustCompile(`^/api/tools/toolsets$`)},
	// MCP connectors. POST adds one server; PUT on the collection is deliberately
	// absent because upstream replaces the WHOLE `mcp_servers` map with the body,
	// so a malformed request would silently drop every connector on the profile.
	// The `{name}` segment names a SERVER, not a profile — `pathProfile` must not
	// match it, and the ticket still scopes the call through the injected profile.
	{methods(http.MethodGet, http.MethodPost), regexp.MustCompile(`^/api/mcp/servers$`)},
	{methods(http.MethodDelete), regexp.MustCompile(`^/api/mcp/servers/[^/]+$`)},
	{methods(http.MethodPost), regexp.MustCompile(`^/api/mcp/servers/[^/]+/test$`)},
	{methods(http.MethodPut), regexp.MustCompile(`^/api/mcp/servers/[^/]+/enabled$`)},
	{methods(http.MethodGet), regexp.MustCompile(`^/api/mcp/catalog$`)},
	{methods(http.MethodPost), regexp.MustCompile(`^/api/mcp/catalog/install$`)},
	{methods(http.MethodGet, http.MethodPost), regexp.MustCompile(`^/api/skills$`)},
	{methods(http.MethodPut), regexp.MustCompile(`^/api/skills/(content|toggle)$`)},
	{methods(http.MethodGet, http.MethodPost), regexp.MustCompile(`^/api/profiles$`)},
	{methods(http.MethodGet, http.MethodPut), regexp.MustCompile(`^/api/profiles/[^/]+/(soul|description)$`)},
	{methods(http.MethodGet), regexp.MustCompile(`^/api/sessions$`)},
	{methods(http.MethodGet, http.MethodDelete, http.MethodPatch), regexp.MustCompile(`^/api/sessions/[^/]+$`)},
	{methods(http.MethodGet), regexp.MustCompile(`^/api/sessions/[^/]+/(history|messages|metrics)$`)},
	{methods(http.MethodGet), regexp.MustCompile(`^/api/(analytics/usage|cron/jobs|messaging/platforms|env|model/info|model/options|providers/oauth|skills/content)$`)},
	{methods(http.MethodPut), regexp.MustCompile(`^/api/tools/toolsets/[^/]+$`)},
	{methods(http.MethodPost), regexp.MustCompile(`^/api/providers/validate$`)},
	{methods(http.MethodPut, http.MethodDelete), regexp.MustCompile(`^/api/env$`)},
	{methods(http.MethodPost), regexp.MustCompile(`^/api/model/set$`)},
	{methods(http.MethodPut), regexp.MustCompile(`^/api/messaging/platforms/[^/]+$`)},
	{methods(http.MethodPost), regexp.MustCompile(`^/api/messaging/platforms/[^/]+/test$`)},
	{methods(http.MethodPost), regexp.MustCompile(`^/api/messaging/telegram/onboarding/start$`)},
	{methods(http.MethodGet, http.MethodDelete), regexp.MustCompile(`^/api/messaging/telegram/onboarding/[^/]+$`)},
	{methods(http.MethodPost), regexp.MustCompile(`^/api/messaging/telegram/onboarding/[^/]+/apply$`)},
	{methods(http.MethodPost, http.MethodDelete), regexp.MustCompile(`^/api/providers/oauth/[^/]+(/start)?$`)},
	{methods(http.MethodGet), regexp.MustCompile(`^/api/providers/oauth/[^/]+/poll/[^/]+$`)},
	{methods(http.MethodDelete), regexp.MustCompile(`^/api/providers/oauth/sessions/[^/]+$`)},
}

// Routes whose upstream work is a live MCP handshake — spawning `npx` cold or
// opening a remote session takes tens of seconds. GET stays on the short client:
// listing servers only reads config.yaml.
var mcpProbeRoutes = regexp.MustCompile(`^/api/mcp/(servers|servers/[^/]+/test|catalog/install)$`)

func slowRuntimeRoute(method, path string) bool {
	return method != http.MethodGet && mcpProbeRoutes.MatchString(path)
}

// Routes that name their profile in the URL rather than in the JSON body.
// `injectProfileJSON` cannot scope these: the runtime resolves the profile from
// the path segment and ignores the body key, so a ticket for profile A would
// otherwise read and rewrite profile B's SOUL.md. `pathProfile` gives the proxy
// the segment to compare against the ticket.
var profileScopedRoute = regexp.MustCompile(`^/api/profiles/([^/]+)/`)

// pathProfile reports the profile a runtime path addresses in its URL, and
// whether the path carries one at all. Paths reaching this point are already
// allowlisted, so a match is exact rather than heuristic.
func pathProfile(path string) (string, bool) {
	match := profileScopedRoute.FindStringSubmatch(path)
	if match == nil {
		return "", false
	}
	return match[1], true
}

func allowedRuntimeRoute(method, path string) bool {
	method = strings.ToUpper(method)
	// A path can match more than one rule (e.g. `/api/env` is covered by both a
	// GET-only rule and a PUT/DELETE rule). Allow the request when ANY matching
	// rule permits the method — never return on the first path match alone, or
	// the earlier GET-only rule would shadow the later PUT/DELETE one.
	for _, rule := range runtimeRoutes {
		if rule.path.MatchString(path) {
			if _, ok := rule.methods[method]; ok {
				return true
			}
		}
	}
	return false
}
