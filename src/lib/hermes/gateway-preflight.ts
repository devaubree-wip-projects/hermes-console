import "server-only";

import type { RuntimeInstallationStatus } from "@/db/schema";
import { createGatewayServiceHeaders } from "@/lib/hermes/gateway-auth";

export const SUPPORTED_GATEWAY_PROTOCOL = 1;

export type DiscoveredRuntimeProfile = {
  name: string;
  description?: string;
  provider?: string | null;
  model?: string | null;
  gatewayRunning?: boolean;
};

export type GatewayPreflightResult = {
  status: RuntimeInstallationStatus;
  statusDetail: string | null;
  statusReason: string | null;
  protocolVersion: number;
  gatewayVersion: string | null;
  hermesVersion: string | null;
  runtimeKind: "docker" | "systemwide" | "unknown";
  features: string[];
  lifecycle: string[];
  profiles: DiscoveredRuntimeProfile[];
  system: Record<string, unknown>;
  lastSeenAt: Date | null;
};

type CapabilitiesBody = {
  protocolVersion?: unknown;
  gatewayVersion?: unknown;
  installationId?: unknown;
  runtimeKind?: unknown;
  features?: unknown;
  lifecycle?: unknown;
};

type PreflightBody = {
  ok?: unknown;
  protocolVersion?: unknown;
  gatewayVersion?: unknown;
  installationId?: unknown;
  runtimeKind?: unknown;
  hermesVersion?: unknown;
  profiles?: unknown;
  system?: unknown;
};

export class GatewayProbeError extends Error {
  constructor(
    message: string,
    readonly category: "network" | "identity" | "gateway" | "runtime" | "profiles",
  ) {
    super(message);
    this.name = "GatewayProbeError";
  }
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function runtimeKind(value: unknown): GatewayPreflightResult["runtimeKind"] {
  return value === "docker" || value === "systemwide" ? value : "unknown";
}

function profiles(value: unknown): DiscoveredRuntimeProfile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name || (name !== "default" && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(name))) return [];
    return [{
      name,
      description: typeof candidate.description === "string" ? candidate.description : undefined,
      provider: typeof candidate.provider === "string" ? candidate.provider : null,
      model: typeof candidate.model === "string" ? candidate.model : null,
      gatewayRunning: candidate.gatewayRunning === true,
    }];
  });
}

function safeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function fetchWithTimeout(url: string, init?: RequestInit) {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    throw new GatewayProbeError("Le Edge Gateway est injoignable.", "network");
  }
}

export async function probeGateway(gatewayUrl: string, installationKey: string): Promise<GatewayPreflightResult> {
  const [health, capabilities, ready] = await Promise.all([
    fetchWithTimeout(`${gatewayUrl}/healthz`),
    fetchWithTimeout(`${gatewayUrl}/v1/capabilities`),
    fetchWithTimeout(`${gatewayUrl}/readyz`),
  ]);
  if (!health.ok || !capabilities.ok) {
    throw new GatewayProbeError("Le service distant ne répond pas comme un Edge Gateway Hermes.", "gateway");
  }
  const capabilityBody = await capabilities.json().catch(() => null) as CapabilitiesBody | null;
  if (!capabilityBody) {
    throw new GatewayProbeError("La réponse de capacités du Edge est invalide.", "gateway");
  }
  if (capabilityBody.installationId !== installationKey) {
    throw new GatewayProbeError("L’identité d’installation ne correspond pas au Edge distant.", "identity");
  }
  const protocolVersion = typeof capabilityBody.protocolVersion === "number"
    ? capabilityBody.protocolVersion
    : 0;
  const base = {
    protocolVersion,
    gatewayVersion: typeof capabilityBody.gatewayVersion === "string" ? capabilityBody.gatewayVersion : null,
    hermesVersion: null,
    runtimeKind: runtimeKind(capabilityBody.runtimeKind),
    features: stringList(capabilityBody.features),
    lifecycle: stringList(capabilityBody.lifecycle),
    profiles: [],
    system: {},
  } satisfies Omit<GatewayPreflightResult, "status" | "statusDetail" | "statusReason" | "lastSeenAt">;
  if (protocolVersion !== SUPPORTED_GATEWAY_PROTOCOL) {
    return {
      ...base,
      status: "incompatible",
      statusDetail: `Protocole Edge ${protocolVersion || "inconnu"}, version supportée ${SUPPORTED_GATEWAY_PROTOCOL}.`,
      statusReason: "gateway_protocol_incompatible",
      lastSeenAt: new Date(),
    };
  }

  const requestUri = "/v1/preflight";
  const preflight = await fetchWithTimeout(`${gatewayUrl}${requestUri}`, {
    headers: createGatewayServiceHeaders({
      method: "GET",
      requestUri,
      profile: "default",
      installationKey,
    }),
  });
  if (preflight.status === 401 || preflight.status === 403) {
    throw new GatewayProbeError("Le Edge a refusé l’identité de la Console.", "identity");
  }
  if (!preflight.ok) {
    return {
      ...base,
      status: ready.ok ? "degraded" : "offline",
      statusDetail: ready.ok
        ? "Edge joignable, mais le préflight Hermes est incomplet."
        : "Edge joignable, runtime Hermes indisponible.",
      statusReason: ready.ok ? "preflight_unavailable" : "runtime_offline",
      lastSeenAt: new Date(),
    };
  }
  const body = await preflight.json().catch(() => null) as PreflightBody | null;
  if (!body || body.installationId !== installationKey || body.protocolVersion !== SUPPORTED_GATEWAY_PROTOCOL) {
    throw new GatewayProbeError("Le préflight a renvoyé une identité ou un protocole incohérent.", "identity");
  }
  const discoveredProfiles = profiles(body.profiles);
  return {
    ...base,
    status: ready.ok && discoveredProfiles.length > 0 ? "ready" : ready.ok ? "degraded" : "offline",
    statusDetail: ready.ok && discoveredProfiles.length === 0
      ? "Aucun profil Hermes exploitable n’a été découvert."
      : ready.ok ? null : "Runtime Hermes indisponible.",
    statusReason: ready.ok && discoveredProfiles.length === 0
      ? "profiles_missing"
      : ready.ok ? null : "runtime_offline",
    gatewayVersion: typeof body.gatewayVersion === "string" ? body.gatewayVersion : base.gatewayVersion,
    hermesVersion: typeof body.hermesVersion === "string" ? body.hermesVersion : null,
    runtimeKind: runtimeKind(body.runtimeKind),
    profiles: discoveredProfiles,
    system: safeRecord(body.system),
    lastSeenAt: new Date(),
  };
}

export async function testGatewayProfile(gatewayUrl: string, installationKey: string, profile: string) {
  const requestUri = "/v1/control/profile-test";
  const body = JSON.stringify({ profile });
  const response = await fetchWithTimeout(`${gatewayUrl}${requestUri}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...createGatewayServiceHeaders({
        method: "POST",
        requestUri,
        profile,
        installationKey,
        body,
      }),
    },
    body,
  });
  if (!response.ok) {
    throw new GatewayProbeError(
      response.status === 401 || response.status === 403
        ? "Le Edge a refusé le test du profil."
        : "Le profil Hermes n’a pas réussi le test de session éphémère.",
      response.status === 401 || response.status === 403 ? "identity" : "profiles",
    );
  }
  const result = await response.json().catch(() => null) as { ok?: unknown; cleanup?: unknown } | null;
  if (result?.ok !== true || result.cleanup !== true) {
    throw new GatewayProbeError("Le test du profil n’a pas confirmé le nettoyage de sa session éphémère.", "profiles");
  }
  return { ok: true as const, profile, cleanup: true as const };
}
