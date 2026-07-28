import { hermesFetch, runLocalHermesGatewayCommand } from "@/lib/hermes/server";
import { hermesMessagingRuntime } from "./hermes-messaging-runtime";
import type {
  McpCatalogEntry,
  McpRuntimePort,
  McpServerSummary,
  McpTestResult,
} from "../application/mcp-ports";

// Connecter un serveur MCP démarre un sous-processus ou ouvre une session HTTP :
// bien plus lent que les 5 s par défaut de `hermesFetch`.
const CONNECT_TIMEOUT_MS = 25_000;

function scopedPath(path: string, profile: string) {
  return `${path}${path.includes("?") ? "&" : "?"}profile=${encodeURIComponent(profile)}`;
}

/** Le nom de serveur voyage dans l'URL : on l'encode même s'il est déjà validé en amont. */
function serverPath(name: string, suffix = "") {
  return `/api/mcp/servers/${encodeURIComponent(name)}${suffix}`;
}

/** Le runtime a déjà changé de forme par le passé — on accepte les variantes plutôt que de casser. */
function listOf<T>(value: unknown, ...keys: string[]): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    for (const key of keys) {
      const candidate = (value as Record<string, unknown>)[key];
      if (Array.isArray(candidate)) return candidate as T[];
    }
  }
  return [];
}

export const hermesMcpRuntime: McpRuntimePort = {
  async list(agentId, profile) {
    const response = await hermesFetch<unknown>(scopedPath("/api/mcp/servers", profile), {}, { agentId, profile });
    return { servers: listOf<McpServerSummary>(response, "servers") };
  },

  add(agentId, profile, input) {
    return hermesFetch<unknown>(
      "/api/mcp/servers",
      {
        method: "POST",
        body: JSON.stringify({
          profile,
          name: input.name,
          ...(input.url ? { url: input.url } : {}),
          ...(input.command ? { command: input.command } : {}),
          ...(input.args?.length ? { args: input.args } : {}),
          ...(input.env ? { env: input.env } : {}),
          // Le runtime déduit le mode d'authentification de `auth`, jamais de la
          // présence du jeton : sans `auth: "header"`, il rejette le corps en 400
          // « Bearer token requires header authentication » et aucun serveur
          // distant protégé ne peut être ajouté depuis la Console.
          ...(input.bearerToken ? { bearer_token: input.bearerToken, auth: "header" } : {}),
        }),
        signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
      },
      { agentId, profile },
    );
  },

  remove(agentId, profile, name) {
    // Pas de corps : l'Edge force alors `?profile=` dans la query, seul canal de
    // cloisonnement disponible pour cette route.
    return hermesFetch<unknown>(
      scopedPath(serverPath(name), profile),
      { method: "DELETE" },
      { agentId, profile },
    );
  },

  test(agentId, profile, name) {
    // Sans corps, volontairement : le runtime ne lit le profil qu'en query sur
    // cette route (aucun modèle de corps côté FastAPI). Un corps JSON ferait
    // porter le profil là où il est ignoré.
    return hermesFetch<McpTestResult>(
      scopedPath(serverPath(name, "/test"), profile),
      { method: "POST", signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) },
      { agentId, profile },
    );
  },

  setEnabled(agentId, profile, name, enabled) {
    return hermesFetch<unknown>(
      serverPath(name, "/enabled"),
      { method: "PUT", body: JSON.stringify({ profile, enabled }) },
      { agentId, profile },
    );
  },

  async catalog(agentId, profile) {
    const response = await hermesFetch<unknown>(scopedPath("/api/mcp/catalog", profile), {}, { agentId, profile });
    return { entries: listOf<McpCatalogEntry>(response, "entries", "catalog", "servers") };
  },

  installFromCatalog(agentId, profile, input) {
    return hermesFetch<unknown>(
      "/api/mcp/catalog/install",
      {
        method: "POST",
        body: JSON.stringify({
          profile,
          name: input.name,
          enable: input.enable,
          ...(input.env ? { env: input.env } : {}),
        }),
        signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
      },
      { agentId, profile },
    );
  },

  async setCredential(agentId, profile, key, value) {
    await hermesFetch<unknown>(
      "/api/env",
      { method: "PUT", body: JSON.stringify({ key, value, profile }) },
      { agentId, profile },
    );
  },

  lifecycle(agentId, profile, action) {
    return runLocalHermesGatewayCommand(agentId, profile, action);
  },

  // Même classification et même expurgation des secrets que la messagerie : un
  // message d'erreur runtime peut contenir un jeton, ici comme là-bas.
  classifyError: hermesMessagingRuntime.classifyError,
};
