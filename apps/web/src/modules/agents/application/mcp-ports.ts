import type { AgentContextPort } from "../domain/agent-context";
// Le contrat d'audit n'a rien de spécifique à la messagerie : même forme, même
// implémentation Drizzle. On l'alias plutôt que de le dupliquer.
import type { MessagingAuditPort as AgentAuditPort } from "./messaging-ports";

export type { AgentAuditPort };

export type McpTransport = "http" | "stdio" | "unknown";

/** Ce que le runtime renvoie pour un serveur — les valeurs d'env y sont déjà masquées. */
export type McpServerSummary = {
  name: string;
  transport?: McpTransport;
  url?: string | null;
  command?: string | null;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  auth?: string | null;
  [key: string]: unknown;
};

export type McpCatalogEntry = {
  name: string;
  description?: string;
  installed?: boolean;
  /** Vrai quand l'entrée doit être clonée et compilée dans le runtime avant usage. */
  needs_install?: boolean;
  [key: string]: unknown;
};

/**
 * Une variable d'environnement telle que saisie dans la Console. `value` vide
 * signifie « déjà posée dans le profil, ne pas réécrire » : c'est ce qui permet
 * de ré-enregistrer un serveur sans re-saisir ses secrets.
 */
export type McpEnvEntry = { key: string; value: string };

export type McpServerInput = {
  name: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: McpEnvEntry[];
  bearerToken?: string;
};

export type McpTestResult = {
  ok?: boolean;
  tools?: Array<{ name?: string; description?: string }>;
  error?: string;
  detail?: string;
  [key: string]: unknown;
};

export interface McpRuntimePort {
  list(agentId: string, profile: string): Promise<{ servers: McpServerSummary[] }>;
  /** `env` porte des références `${VAR}`, jamais des valeurs. */
  add(
    agentId: string,
    profile: string,
    input: { name: string; url?: string; command?: string; args?: string[]; env?: Record<string, string>; bearerToken?: string },
  ): Promise<unknown>;
  remove(agentId: string, profile: string, name: string): Promise<unknown>;
  test(agentId: string, profile: string, name: string): Promise<McpTestResult>;
  setEnabled(agentId: string, profile: string, name: string, enabled: boolean): Promise<unknown>;
  catalog(agentId: string, profile: string): Promise<{ entries: McpCatalogEntry[] }>;
  installFromCatalog(
    agentId: string,
    profile: string,
    input: { name: string; env?: Record<string, string>; enable: boolean },
  ): Promise<unknown>;
  /** Pose un secret dans le `.env` du profil. La valeur ne revient jamais en lecture. */
  setCredential(agentId: string, profile: string, key: string, value: string): Promise<void>;
  lifecycle(agentId: string, profile: string, action: "start" | "restart"): Promise<unknown>;
  classifyError(error: unknown): { message: string; status: number; safeMessage: string };
}

export type McpDependencies = {
  contexts: AgentContextPort;
  runtime: McpRuntimePort;
  audit: AgentAuditPort;
};

/** Nom de serveur : sert de segment d'URL runtime et de suffixe de toolset `mcp-<nom>`. */
export function validMcpServerName(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value);
}

/**
 * Variables qui détournent le runtime au lieu de configurer un serveur. Un proxy
 * capte tout le trafic d'inférence du profil — clé d'API et conversations
 * comprises ; un registre détourne ce que `npx`/`uvx` télécharge ; `HERMES_*`
 * repointe la configuration du runtime elle-même. Le runtime en refuse une
 * partie (`PATH`, `PYTHON*`), pas celles-là.
 */
const RESERVED_ENV_KEYS = new Set([
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
  "PATH", "SHELL", "EDITOR", "GIT_SSH_COMMAND",
  "NODE_OPTIONS", "NODE_PATH", "PYTHONPATH", "PYTHONSTARTUP",
  "PIP_INDEX_URL", "PIP_EXTRA_INDEX_URL", "NPM_CONFIG_REGISTRY", "UV_INDEX_URL",
]);

const RESERVED_ENV_PREFIXES = ["HERMES_", "LD_", "DYLD_"];

export function validEnvKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value)) return false;
  const upper = value.toUpperCase();
  return !RESERVED_ENV_KEYS.has(upper) && !RESERVED_ENV_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

/** Seul http(s) est accepté : un `file://` ou un `unix://` sortirait du modèle de menace. */
export function validMcpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
