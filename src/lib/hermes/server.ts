import "server-only";

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createGatewayServiceHeaders } from "@/lib/hermes/gateway-auth";
import {
  environmentRuntimeInstallation,
  runtimeInstallationById,
  runtimeInstallationForAgent,
} from "@/lib/hermes/installations";

export class HermesRuntimeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "HermesRuntimeError";
  }
}

export function hermesRuntimeUrl() {
  return environmentRuntimeInstallation().gatewayHttpUrl;
}

export type HermesGatewayPlatformState = {
  state: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: string | null;
};

function validHermesProfile(profile: string) {
  return profile === "default" || /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(profile);
}

async function isLiveProfileGateway(pid: unknown, profile: string) {
  if (!Number.isSafeInteger(pid) || Number(pid) <= 0) return false;

  try {
    process.kill(Number(pid), 0);
    const argv = (await readFile(`/proc/${pid}/cmdline`, "utf8"))
      .split("\0")
      .filter(Boolean);
    const profileFlag = argv.findIndex((part) => part === "--profile" || part === "-p");
    const isHermes = argv.some((part) => part === "hermes_cli.main" || part.includes("/hermes"));
    return isHermes
      && profileFlag >= 0
      && argv[profileFlag + 1] === profile
      && argv.includes("gateway")
      && argv.includes("run");
  } catch {
    return false;
  }
}

/**
 * Read the profile-owned gateway state as a local-runtime fallback.
 *
 * Hermes 0.18.2 scopes config/env endpoints correctly but its dashboard
 * process can still read gateway_state.json from the dashboard process home
 * instead of a requested named profile. This console is explicitly a local
 * cockpit, so use the profile file only as a best-effort status fallback. A
 * stale state file is accepted only when its PID is still the matching Hermes
 * gateway process for this profile.
 */
export async function readLocalProfileGatewayPlatforms(profile: string) {
  if (!validHermesProfile(profile)) {
    return null;
  }

  const root = process.env.HERMES_HOME?.trim() || path.join(homedir(), ".hermes");
  const home = profile === "default" ? root : path.join(root, "profiles", profile);
  try {
    const payload = JSON.parse(
      await readFile(path.join(home, "gateway_state.json"), "utf8"),
    ) as {
      pid?: unknown;
      gateway_state?: unknown;
      platforms?: Record<string, {
        state?: unknown;
        error_code?: unknown;
        error_message?: unknown;
        updated_at?: unknown;
      }>;
    };
    const platforms = Object.fromEntries(
      Object.entries(payload.platforms ?? {}).map(([platform, state]) => [platform, {
        state: typeof state.state === "string" ? state.state : null,
        errorCode: typeof state.error_code === "string" ? state.error_code : null,
        errorMessage: typeof state.error_message === "string" ? state.error_message : null,
        updatedAt: typeof state.updated_at === "string" ? state.updated_at : null,
      } satisfies HermesGatewayPlatformState]),
    );
    return {
      pid: Number.isSafeInteger(payload.pid) ? Number(payload.pid) : null,
      running:
        payload.gateway_state === "running"
        && await isLiveProfileGateway(payload.pid, profile),
      state: typeof payload.gateway_state === "string" ? payload.gateway_state : null,
      platforms,
    };
  } catch {
    return null;
  }
}

export async function readLocalProfileGatewaySession(
  profile: string,
  sessionId: string,
) {
  if (!validHermesProfile(profile) || !sessionId) return null;

  const root = process.env.HERMES_HOME?.trim() || path.join(homedir(), ".hermes");
  const home = profile === "default" ? root : path.join(root, "profiles", profile);
  try {
    const payload = JSON.parse(
      await readFile(path.join(home, "sessions", "sessions.json"), "utf8"),
    ) as Record<string, unknown>;
    for (const value of Object.values(payload)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as Record<string, unknown>;
      if (entry.session_id === sessionId) return entry;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Control the user service from outside the gateway process. Hermes' embedded
 * dashboard refuses to restart its own process, while the CLI delegates the
 * operation safely to the profile-owned systemd user service.
 */
export async function runLocalHermesGatewayCommand(
  agentId: string,
  profile: string,
  action: "start" | "restart" | "stop" | "drain" | "resume",
) {
  if (!validHermesProfile(profile)) {
    throw new HermesRuntimeError("Profil Hermes invalide.", 400);
  }

  const installation = await runtimeInstallationForAgent(agentId);
	return runHermesInstallationCommand(installation, profile, action);
}

export async function runHermesInstallationCommand(
  installation: Awaited<ReturnType<typeof runtimeInstallationById>>,
  profile: string,
  action: "start" | "restart" | "stop" | "drain" | "resume",
) {
  if (!validHermesProfile(profile)) {
    throw new HermesRuntimeError("Profil Hermes invalide.", 400);
  }
  if (installation.managementLevel === "external") {
    throw new HermesRuntimeError("Cette installation est externe : le lifecycle Hermes reste sous la responsabilité de son propriétaire.", 403);
  }
  const target = new URL(`${installation.gatewayHttpUrl}/v1/control/gateway`);
  const body = JSON.stringify({ profile, action });
  const signed = createGatewayServiceHeaders({
    method: "POST",
    requestUri: "/v1/control/gateway",
    profile,
    installationKey: installation.installationKey,
    body,
  });
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...signed },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error((await response.text()).trim() || `Edge ${response.status}`);
    }
    return {
      ok: true,
      message: `Gateway ${action} demandé via l’Edge.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Commande Hermes impossible.";
    throw new HermesRuntimeError(message, 503);
  }
}

export type HermesBackupResult = {
  backupId: string;
  storageRef: string;
  checksumSha256: string;
  sizeBytes: number;
  secretsPolicy: "excluded" | "encrypted";
  verified: boolean;
};

export async function runHermesBackupCommand(
  installation: Awaited<ReturnType<typeof runtimeInstallationById>>,
  input: { action: "create" | "verify" | "restore" | "delete"; profile: string; backupId: string; includeSecrets?: boolean },
) {
  if (installation.managementLevel !== "managed") {
    throw new HermesRuntimeError("Les sauvegardes et restaurations exigent une installation managée.", 403);
  }
  if (!validHermesProfile(input.profile) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(input.backupId)) {
    throw new HermesRuntimeError("Commande de sauvegarde invalide.", 400);
  }
  const target = new URL(`${installation.gatewayHttpUrl}/v1/control/backup`);
  const body = JSON.stringify({
    action: input.action,
    profile: input.profile,
    backupId: input.backupId,
    includeSecrets: input.includeSecrets === true,
  });
  const signed = createGatewayServiceHeaders({
    method: "POST", requestUri: "/v1/control/backup", profile: input.profile,
    installationKey: installation.installationKey, body,
  });
  try {
    const response = await fetch(target, {
      method: "POST", headers: { "Content-Type": "application/json", ...signed }, body,
      cache: "no-store", signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error((await response.text()).trim() || `Edge ${response.status}`);
    return await response.json() as HermesBackupResult;
  } catch (error) {
    throw new HermesRuntimeError(error instanceof Error ? error.message : "Sauvegarde Hermes impossible.", 503);
  }
}

export async function runHermesUpgradeCommand(
  installation: Awaited<ReturnType<typeof runtimeInstallationById>>,
  input: { action: "preflight" | "upgrade" | "rollback"; profile: string; targetVersion: string },
) {
  if (installation.managementLevel !== "managed") throw new HermesRuntimeError("Upgrade réservé aux installations managées.", 403);
  if (!validHermesProfile(input.profile) || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,127}$/.test(input.targetVersion)) throw new HermesRuntimeError("Version cible invalide.", 400);
  const target = new URL(`${installation.gatewayHttpUrl}/v1/control/upgrade`);
  const body = JSON.stringify(input);
  const signed = createGatewayServiceHeaders({ method: "POST", requestUri: "/v1/control/upgrade", profile: input.profile, installationKey: installation.installationKey, body });
  try {
    const response = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json", ...signed }, body, cache: "no-store", signal: AbortSignal.timeout(10 * 60 * 1000) });
    if (!response.ok) throw new Error((await response.text()).trim() || `Edge ${response.status}`);
    return await response.json() as { ok: true; action: string; targetVersion: string };
  } catch (error) {
    throw new HermesRuntimeError(error instanceof Error ? error.message : "Upgrade Hermes impossible.", 503);
  }
}

function profileFromRequest(pathname: string, body?: BodyInit | null) {
  const url = new URL(pathname, "http://hermes-console.local");
  const queryProfile = url.searchParams.get("profile");
  if (queryProfile && validHermesProfile(queryProfile)) return queryProfile;
  if (typeof body === "string") {
    try {
      const payload = JSON.parse(body) as { profile?: unknown };
      if (typeof payload.profile === "string" && validHermesProfile(payload.profile)) {
        return payload.profile;
      }
    } catch {
      // Hermes will return the canonical malformed-body error.
    }
  }
  return "default";
}

export type HermesRuntimeScope = {
  agentId?: string;
  installationId?: string;
  profile?: string;
};

export async function hermesFetch<T>(
  path: string,
  init: RequestInit = {},
  scope: HermesRuntimeScope = {},
): Promise<T> {
  const method = init.method?.toUpperCase() || "GET";
  const profile = scope.profile && validHermesProfile(scope.profile)
    ? scope.profile
    : profileFromRequest(path, init.body);
  const installation = scope.agentId
    ? await runtimeInstallationForAgent(scope.agentId)
    : scope.installationId
      ? await runtimeInstallationById(scope.installationId)
      : environmentRuntimeInstallation();
  const gatewayUrl = new URL(`${installation.gatewayHttpUrl}/v1/runtime${path}`);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const body = typeof init.body === "string" ? init.body : null;
  const signed = createGatewayServiceHeaders({
    method,
    requestUri: `/v1/runtime${path}`,
    profile,
    installationKey: installation.installationKey,
    body,
  });
  for (const [name, value] of Object.entries(signed)) {
    headers.set(name, value);
  }

  let response: Response;
  try {
    response = await fetch(gatewayUrl, {
      ...init,
      method,
      headers,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(5_000),
    });
  } catch (error) {
    throw new HermesRuntimeError(
      error instanceof Error ? `Gateway Hermes indisponible : ${error.message}` : "Gateway Hermes indisponible.",
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new HermesRuntimeError(body?.detail ?? `Hermes a répondu ${response.status}.`, response.status);
  }
  return response.json() as Promise<T>;
}

export type HermesSessionRow = {
  id?: string;
  session_id?: string;
  title?: string | null;
  source?: string | null;
  started_at?: number | string | null;
  last_active?: number | string | null;
  message_count?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_tokens?: number | null;
  cache_write_tokens?: number | null;
  reasoning_tokens?: number | null;
  api_call_count?: number | null;
  model?: string | null;
  model_config?: string | Record<string, unknown> | null;
  billing_provider?: string | null;
  estimated_cost_usd?: number | null;
  is_active?: boolean;
  archived?: boolean;
};

export function listHermesSessions(profile: string, limit = 30, scope: HermesRuntimeScope = {}) {
  const query = new URLSearchParams({
    profile,
    limit: String(limit),
    order: "recent",
    archived: "include",
  });
  return hermesFetch<{ sessions: HermesSessionRow[]; total: number }>(`/api/sessions?${query}`, {}, { ...scope, profile });
}

export function createHermesProfile(
  input: { name: string; description?: string | null },
  scope: HermesRuntimeScope = {},
) {
  return hermesFetch<{ ok: boolean; name: string }>("/api/profiles", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      description: input.description ?? "",
      clone_from_default: true,
    }),
  }, scope);
}

export type ApprovalMode = "manual" | "smart" | "off";

export type RuntimeAccess = {
  /** Effective working directory for new sessions (the folder the agent reads/writes). */
  defaultCwd: string | null;
  branch: string | null;
  /** Persisted approval mode governing dangerous-command auto-approval. */
  approvalMode: ApprovalMode | null;
  toolsets: { name: string; label: string; description: string; enabled: boolean }[];
  mcpServers: { name: string; enabled: boolean; status: string | null }[];
  /** True when the runtime could not be reached at all. */
  offline: boolean;
};

function readApprovalMode(config: unknown): ApprovalMode | null {
  const approvals = (config as { approvals?: unknown } | null)?.approvals;
  const mode = (approvals as { mode?: unknown } | null)?.mode;
  return mode === "manual" || mode === "smart" || mode === "off" ? mode : null;
}

function readTerminalCwd(config: unknown): string | null {
  const terminal = (config as { terminal?: unknown } | null)?.terminal;
  const cwd = (terminal as { cwd?: unknown } | null)?.cwd;
  if (typeof cwd !== "string") return null;
  // "." / "auto" / "cwd" / "" all mean "resolve at runtime" — not an explicit path.
  return ["", ".", "auto", "cwd"].includes(cwd) ? null : cwd;
}

function toToolsets(value: unknown): RuntimeAccess["toolsets"] {
  const list = Array.isArray(value)
    ? value
    : Array.isArray((value as { toolsets?: unknown })?.toolsets)
      ? (value as { toolsets: unknown[] }).toolsets
      : [];
  return list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      name: String(item.name ?? ""),
      label: String(item.label ?? item.name ?? "Outil"),
      description: String(item.description ?? "Configuré dans le profil Hermes."),
      enabled: item.enabled !== false,
    }))
    .filter((item) => item.name);
}

function toMcpServers(value: unknown): RuntimeAccess["mcpServers"] {
  const list = Array.isArray(value)
    ? value
    : Array.isArray((value as { servers?: unknown })?.servers)
      ? (value as { servers: unknown[] }).servers
      : [];
  return list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      name: String(item.name ?? ""),
      enabled: item.enabled !== false,
      status: typeof item.status === "string" ? item.status : null,
    }))
    .filter((item) => item.name);
}

/**
 * Aggregate everything the console can say about an agent's real machine access,
 * scoped to its Hermes profile. Every source degrades independently: a single
 * dead endpoint yields nulls/empties, not a thrown panel. `offline` is true only
 * when the runtime is unreachable across the board.
 */
export async function getRuntimeAccess(profile: string, scope: HermesRuntimeScope = {}): Promise<RuntimeAccess> {
  const scoped = `profile=${encodeURIComponent(profile)}`;
  const runtimeScope = { ...scope, profile };
  const [config, defaultCwd, toolsets, mcp] = await Promise.allSettled([
    hermesFetch<Record<string, unknown>>(`/api/config?${scoped}`, {}, runtimeScope),
    hermesFetch<{ cwd?: string; branch?: string }>(`/api/fs/default-cwd`, {}, runtimeScope),
    hermesFetch<unknown>(`/api/tools/toolsets?${scoped}`, {}, runtimeScope),
    hermesFetch<unknown>(`/api/mcp/servers?${scoped}`, {}, runtimeScope),
  ]);

  const offline = [config, defaultCwd, toolsets, mcp].every((r) => r.status === "rejected");
  const configValue = config.status === "fulfilled" ? config.value : null;

  return {
    defaultCwd:
      (defaultCwd.status === "fulfilled" && typeof defaultCwd.value.cwd === "string"
        ? defaultCwd.value.cwd
        : null) ?? readTerminalCwd(configValue),
    branch:
      defaultCwd.status === "fulfilled" && typeof defaultCwd.value.branch === "string"
        ? defaultCwd.value.branch
        : null,
    approvalMode: readApprovalMode(configValue),
    toolsets: toolsets.status === "fulfilled" ? toToolsets(toolsets.value) : [],
    mcpServers: mcp.status === "fulfilled" ? toMcpServers(mcp.value) : [],
    offline,
  };
}

/** Owner-only write of the persistent runtime access config (deep-merged by Hermes). */
export async function updateRuntimeAccess(
  profile: string,
  patch: { approvalMode?: ApprovalMode; defaultCwd?: string },
  scope: HermesRuntimeScope = {},
) {
  const config: Record<string, unknown> = {};
  if (patch.approvalMode) config.approvals = { mode: patch.approvalMode };
  if (patch.defaultCwd !== undefined) config.terminal = { cwd: patch.defaultCwd };
  return hermesFetch<{ ok: boolean }>(`/api/config`, {
    method: "PUT",
    body: JSON.stringify({ profile, config }),
  }, { ...scope, profile });
}

export function getHermesDashboardData(profile: string, scope: HermesRuntimeScope = {}) {
  const scoped = new URLSearchParams({ profile });
  const runtimeScope = { ...scope, profile };
  return Promise.allSettled([
    listHermesSessions(profile, 8, runtimeScope),
    hermesFetch<{ totals?: Record<string, number>; daily?: unknown[] }>(
      `/api/analytics/usage?${new URLSearchParams({ profile, days: "30" })}`,
      {},
      runtimeScope,
    ),
    hermesFetch<{ jobs?: unknown[] }>(`/api/cron/jobs?${scoped}`, {}, runtimeScope),
  ]).then(([sessions, usage, cron]) => ({
    sessions: sessions.status === "fulfilled" ? sessions.value : null,
    usage: usage.status === "fulfilled" ? usage.value : null,
    cron: cron.status === "fulfilled" ? cron.value : null,
    online: sessions.status === "fulfilled" || usage.status === "fulfilled" || cron.status === "fulfilled",
  }));
}
