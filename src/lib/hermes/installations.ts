import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, runtimeInstallations } from "@/db/schema";

export type ResolvedRuntimeInstallation = {
  id: string;
  installationKey: string;
  gatewayHttpUrl: string;
  gatewayWebSocketUrl: string;
  source: "database" | "environment";
  origin: "local_managed" | "remote_existing" | "remote_provisioned";
  managementLevel: "external" | "connected" | "managed";
};

const DEFAULT_INSTALLATION_ID = "local-default";
const DEFAULT_GATEWAY_URL = "http://127.0.0.1:8787";

function parseGatewayUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("L’URL du gateway doit utiliser HTTP ou HTTPS.");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

export function environmentRuntimeInstallation(): ResolvedRuntimeInstallation {
  const gateway = parseGatewayUrl(
    process.env.HERMES_DEFAULT_GATEWAY_URL?.trim() || DEFAULT_GATEWAY_URL,
  );
  const websocket = new URL(gateway);
  websocket.protocol = gateway.protocol === "https:" ? "wss:" : "ws:";
  websocket.pathname = `${gateway.pathname}/v1/ws`.replace(/\/+/g, "/");
  return {
    id: process.env.HERMES_DEFAULT_INSTALLATION_ID?.trim() || DEFAULT_INSTALLATION_ID,
    installationKey: process.env.HERMES_DEFAULT_INSTALLATION_ID?.trim() || DEFAULT_INSTALLATION_ID,
    gatewayHttpUrl: gateway.toString().replace(/\/$/, ""),
    gatewayWebSocketUrl: websocket.toString(),
    source: "environment",
    origin: "local_managed",
    managementLevel: "managed",
  };
}

export function environmentRuntimeInstallationValues(tenantId: string, createdByUserId: string) {
  const installation = environmentRuntimeInstallation();
  return {
    tenantId,
    createdByUserId,
    name: process.env.HERMES_DEFAULT_INSTALLATION_NAME?.trim() || "Hermes local",
    installationKey: installation.installationKey,
    origin: "local_managed" as const,
    managementLevel: "managed" as const,
    transport: "direct" as const,
    gatewayUrl: installation.gatewayHttpUrl,
    status: "checking" as const,
  };
}

export async function ensureEnvironmentRuntimeInstallation(tenantId: string, createdByUserId: string) {
  const values = environmentRuntimeInstallationValues(tenantId, createdByUserId);
  const [installation] = await db
    .insert(runtimeInstallations)
    .values(values)
    .onConflictDoUpdate({
      target: [runtimeInstallations.tenantId, runtimeInstallations.installationKey],
      set: { gatewayUrl: values.gatewayUrl, updatedAt: new Date() },
    })
    .returning();
  return installation;
}

function resolvedDatabaseInstallation(row: typeof runtimeInstallations.$inferSelect): ResolvedRuntimeInstallation {
  const gateway = parseGatewayUrl(row.gatewayUrl);
  const websocket = new URL(gateway);
  websocket.protocol = gateway.protocol === "https:" ? "wss:" : "ws:";
  websocket.pathname = `${gateway.pathname}/v1/ws`.replace(/\/+/g, "/");
  return {
    id: row.id,
    installationKey: row.installationKey,
    gatewayHttpUrl: gateway.toString().replace(/\/$/, ""),
    gatewayWebSocketUrl: websocket.toString(),
    source: "database",
    origin: row.origin,
    managementLevel: row.managementLevel,
  };
}

export async function runtimeInstallationForAgent(agentId: string) {
  const [row] = await db
    .select({ installation: runtimeInstallations })
    .from(agents)
    .innerJoin(
      runtimeInstallations,
      eq(agents.runtimeInstallationId, runtimeInstallations.id),
    )
    .where(eq(agents.id, agentId))
    .limit(1);
  return row ? resolvedDatabaseInstallation(row.installation) : environmentRuntimeInstallation();
}

export async function runtimeInstallationById(installationId?: string | null) {
  if (!installationId) return environmentRuntimeInstallation();
  const [row] = await db
    .select()
    .from(runtimeInstallations)
    .where(eq(runtimeInstallations.id, installationId))
    .limit(1);
  if (!row) throw new Error("Installation runtime introuvable.");
  return resolvedDatabaseInstallation(row);
}
