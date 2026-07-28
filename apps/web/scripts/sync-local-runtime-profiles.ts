import { createHash, createHmac, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { agents, runtimeCapabilities, runtimeInstallations } from "../src/db/schema";
import { resolveInstallationSecret } from "../src/lib/hermes/installation-secrets";

type HermesProfile = {
  name: string;
  model?: string | null;
  provider?: string | null;
  gateway_running?: boolean;
};

type HermesProfilesResponse = {
  profiles?: HermesProfile[];
};

type GatewayCapabilities = {
  features?: string[];
  gatewayVersion?: string;
  installationId?: string;
  lifecycle?: string[];
  protocolVersion?: number;
  runtimeKind?: "docker" | "systemwide" | "unknown";
};

type HermesStatus = {
  release_date?: string;
  version?: string;
};

export type LocalRuntimeIdentity = {
  gatewayUrl: string;
  installationKey: string;
  capabilities: GatewayCapabilities;
};

async function gatewayFetch<T>(runtime: LocalRuntimeIdentity, requestUri: string, profile: string, init: RequestInit = {}) {
  const method = init.method?.toUpperCase() || "GET";
  const body = typeof init.body === "string" ? init.body : "";
  const timestamp = Date.now();
  const nonce = randomBytes(16).toString("hex");
  const digest = createHash("sha256").update(body).digest("hex");
  const canonical = [method, requestUri, String(timestamp), nonce, profile, digest].join("\n");
  const secret = await resolveInstallationSecret("service", runtime.installationKey);
  const signature = createHmac("sha256", secret).update(canonical).digest("base64url");
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (body) headers.set("Content-Type", "application/json");
  headers.set("X-Hermes-Timestamp", String(timestamp));
  headers.set("X-Hermes-Nonce", nonce);
  headers.set("X-Hermes-Signature", signature);
  headers.set("X-Hermes-Profile", profile);
  headers.set("X-Hermes-Installation-Id", runtime.installationKey);

  const response = await fetch(`${runtime.gatewayUrl}${requestUri}`, {
    ...init,
    method,
    headers,
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Edge Hermes ${method} ${requestUri}: HTTP ${response.status} ${payload.slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}

export async function discoverLocalRuntime(input: { gatewayUrl?: string } = {}): Promise<LocalRuntimeIdentity> {
  const rawGatewayUrl = input.gatewayUrl?.trim()
    || process.env.HERMES_DEFAULT_GATEWAY_URL?.trim()
    || "http://127.0.0.1:8787";
  const url = new URL(rawGatewayUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Le gateway Docker Hermes doit utiliser HTTP ou HTTPS.");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  const gatewayUrl = url.toString().replace(/\/$/, "");

  let capabilitiesResponse: Response;
  try {
    capabilitiesResponse = await fetch(`${gatewayUrl}/v1/capabilities`, {
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new Error(`Docker Hermes est injoignable sur ${gatewayUrl}. Démarrez-le avant le seed.`);
  }
  if (!capabilitiesResponse.ok) {
    throw new Error(`Edge Hermes /v1/capabilities: HTTP ${capabilitiesResponse.status}`);
  }
  const capabilities = await capabilitiesResponse.json() as GatewayCapabilities;
  const installationKey = typeof capabilities.installationId === "string"
    ? capabilities.installationId.trim()
    : "";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(installationKey)) {
    throw new Error("L’Edge Docker n’a pas fourni d’identité d’installation valide.");
  }

  return { gatewayUrl, installationKey, capabilities };
}

export async function syncLocalRuntimeProfiles(input?: LocalRuntimeIdentity) {
  const runtime = input ?? await discoverLocalRuntime();
  const { gatewayUrl, installationKey, capabilities } = runtime;
  const localInstallations = await db.select({ id: runtimeInstallations.id })
    .from(runtimeInstallations)
    .where(and(
      eq(runtimeInstallations.installationKey, installationKey),
      eq(runtimeInstallations.origin, "local_managed"),
      isNull(runtimeInstallations.archivedAt),
    ));

  if (localInstallations.length === 0) {
    console.log("Aucune installation locale enregistrée à synchroniser.");
    return { installations: 0, profiles: 0, created: 0 };
  }

  const localAgents = await db.select({
    id: agents.id,
    profile: agents.hermesProfileName,
    description: agents.description,
  }).from(agents)
    .innerJoin(runtimeInstallations, eq(runtimeInstallations.id, agents.runtimeInstallationId))
    .where(and(
      eq(runtimeInstallations.installationKey, installationKey),
      eq(runtimeInstallations.origin, "local_managed"),
      isNull(runtimeInstallations.archivedAt),
    ));

  if (capabilities.installationId !== installationKey) {
    throw new Error(`Identité Edge inattendue : ${capabilities.installationId ?? "absente"}.`);
  }

  const profilesUri = "/v1/runtime/api/profiles";
  let profiles = (await gatewayFetch<HermesProfilesResponse>(runtime, profilesUri, "default")).profiles ?? [];
  const existingProfiles = new Set(profiles.map((profile) => profile.name));
  const uniqueAgents = new Map(localAgents.map((agent) => [agent.profile, agent]));
  let created = 0;

  for (const agent of uniqueAgents.values()) {
    if (existingProfiles.has(agent.profile)) continue;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(agent.profile)) {
      throw new Error(`Profil Hermes invalide en base : ${agent.profile}`);
    }
    await gatewayFetch<{ ok: boolean }>(runtime, profilesUri, agent.profile, {
      method: "POST",
      body: JSON.stringify({
        name: agent.profile,
        description: agent.description ?? "",
        clone_from_default: true,
      }),
    });
    existingProfiles.add(agent.profile);
    created += 1;
  }

  if (created > 0) {
    profiles = (await gatewayFetch<HermesProfilesResponse>(runtime, profilesUri, "default")).profiles ?? [];
  }
  const status = await gatewayFetch<HermesStatus>(runtime, "/v1/runtime/api/status", "default");
  const now = new Date();
  const profileCapabilities = profiles.map((profile) => ({
    name: profile.name,
    provider: profile.provider ?? undefined,
    model: profile.model ?? undefined,
    gatewayRunning: profile.gateway_running === true,
  }));

  await db.transaction(async (tx) => {
    for (const installation of localInstallations) {
      await tx.update(runtimeInstallations).set({
        gatewayUrl,
        status: "ready",
        statusDetail: null,
        statusReason: null,
        gatewayProtocolVersion: capabilities.protocolVersion ?? 1,
        hermesVersion: status.release_date ?? status.version ?? null,
        detectedRuntime: capabilities.runtimeKind ?? "docker",
        lastSeenAt: now,
        updatedAt: now,
      }).where(eq(runtimeInstallations.id, installation.id));
      await tx.insert(runtimeCapabilities).values({
        installationId: installation.id,
        protocolVersion: capabilities.protocolVersion ?? 1,
        features: capabilities.features ?? [],
        lifecycle: capabilities.lifecycle ?? [],
        profiles: profileCapabilities,
        limits: {},
        negotiatedAt: now,
      }).onConflictDoUpdate({
        target: runtimeCapabilities.installationId,
        set: {
          protocolVersion: capabilities.protocolVersion ?? 1,
          features: capabilities.features ?? [],
          lifecycle: capabilities.lifecycle ?? [],
          profiles: profileCapabilities,
          negotiatedAt: now,
          updatedAt: now,
        },
      });
    }
    for (const agent of localAgents) {
      if (!existingProfiles.has(agent.profile)) continue;
      await tx.update(agents).set({
        runtimeState: "ready",
        runtimeError: null,
        updatedAt: now,
      }).where(eq(agents.id, agent.id));
    }
  });

  console.log(`${localInstallations.length} installation(s), ${profiles.length} profil(s), ${created} profil(s) créé(s).`);
  return { installations: localInstallations.length, profiles: profiles.length, created };
}

if (import.meta.main) {
  syncLocalRuntimeProfiles()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
