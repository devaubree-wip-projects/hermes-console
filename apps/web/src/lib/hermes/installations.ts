import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents, runtimeInstallations, workspaces } from "@/db/schema";
import { generateInstallationKey } from "@/modules/installations/domain/installation";

export type ResolvedRuntimeInstallation = {
  id: string;
  installationKey: string;
  gatewayHttpUrl: string;
  gatewayWebSocketUrl: string;
  source: "database" | "environment";
  origin: "local_managed" | "remote_existing" | "remote_provisioned";
  managementLevel: "external" | "connected" | "managed";
};

export class RuntimeInstallationSelectionError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "RuntimeInstallationSelectionError";
  }
}

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

// L'URL du gateway a deux publics. Le serveur joint l'Edge par son nom de service
// Docker ; le navigateur, lui, a besoin d'une adresse publique — un déploiement
// conteneurisé ne peut pas satisfaire les deux avec la même valeur. Quand
// HERMES_PUBLIC_GATEWAY_URL est posée, elle ne remplace QUE l'URL WebSocket :
// les appels serveur→Edge continuent de passer en direct, sans ressortir par le
// reverse proxy (où l'allowlist d'IP les rejetterait).
// Réservé au runtime local : une installation distante porte déjà une URL
// publique valable pour son propre site, que cette surcharge écraserait.
function websocketUrlFor(gateway: URL, local: boolean) {
  const override = local ? process.env.HERMES_PUBLIC_GATEWAY_URL?.trim() : undefined;
  const base = override ? parseGatewayUrl(override) : gateway;
  const websocket = new URL(base);
  websocket.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  websocket.pathname = `${base.pathname}/v1/ws`.replace(/\/+/g, "/");
  return websocket.toString();
}

export function environmentRuntimeInstallation(): ResolvedRuntimeInstallation {
  const gateway = parseGatewayUrl(
    process.env.HERMES_DEFAULT_GATEWAY_URL?.trim() || DEFAULT_GATEWAY_URL,
  );
  return {
    id: process.env.HERMES_DEFAULT_INSTALLATION_ID?.trim() || DEFAULT_INSTALLATION_ID,
    installationKey: process.env.HERMES_DEFAULT_INSTALLATION_ID?.trim() || DEFAULT_INSTALLATION_ID,
    gatewayHttpUrl: gateway.toString().replace(/\/$/, ""),
    gatewayWebSocketUrl: websocketUrlFor(gateway, true),
    source: "environment",
    origin: "local_managed",
    managementLevel: "managed",
  };
}

type InstallationWriter = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * La clé d'environnement (`HERMES_DEFAULT_INSTALLATION_ID`) désigne l'unique runtime
 * local décrit par la configuration : elle ne peut appartenir qu'à un seul tenant.
 * Les suivants reçoivent une clé propre — leur runtime reste à provisionner, ce que
 * la Console affiche via le statut `checking`, plutôt que de leur prêter celui du voisin.
 *
 * La revendication passe par l'insertion elle-même, jamais par un « lire puis écrire » :
 * deux onboardings concurrents liraient tous deux la clé comme libre et l'un des deux
 * échouerait sur l'index unique au lieu de recevoir une clé générée.
 */
export async function insertEnvironmentRuntimeInstallation(
  writer: InstallationWriter,
  input: { id?: string; tenantId: string; createdByUserId: string },
) {
  const identity = input.id ? { id: input.id } : {};
  const [claimed] = await writer
    .insert(runtimeInstallations)
    .values({
      ...identity,
      ...environmentRuntimeInstallationValues(
        input.tenantId,
        input.createdByUserId,
        environmentRuntimeInstallation().installationKey,
      ),
    })
    .onConflictDoNothing()
    .returning();
  if (claimed) return claimed;
  const [generated] = await writer
    .insert(runtimeInstallations)
    .values({
      ...identity,
      ...environmentRuntimeInstallationValues(
        input.tenantId,
        input.createdByUserId,
        generateInstallationKey(),
      ),
    })
    .returning();
  return generated;
}

// Volontairement non exportée : passer une clé arbitraire est précisément la porte
// par laquelle deux tenants finissaient par en partager une. Utiliser la variante `For`.
function environmentRuntimeInstallationValues(
  tenantId: string,
  createdByUserId: string,
  installationKey: string,
) {
  const installation = environmentRuntimeInstallation();
  return {
    tenantId,
    createdByUserId,
    name: process.env.HERMES_DEFAULT_INSTALLATION_NAME?.trim() || "Hermes local",
    installationKey,
    origin: "local_managed" as const,
    managementLevel: "managed" as const,
    transport: "direct" as const,
    gatewayUrl: installation.gatewayHttpUrl,
    status: "checking" as const,
  };
}

export async function ensureEnvironmentRuntimeInstallation(tenantId: string, createdByUserId: string) {
  // Idempotence portée par le tenant et non plus par la clé, qui est désormais générée
  // et ne peut donc plus servir de cible de conflit stable. Le verrou sérialise deux
  // créations d'agent concurrentes : sans lui, chacune lirait « aucune installation »
  // et le tenant se retrouverait avec ses agents répartis sur deux runtimes.
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('runtime-installation'), hashtext(${tenantId}))`);
    const [existing] = await tx
      .select()
      .from(runtimeInstallations)
      .where(and(
        eq(runtimeInstallations.tenantId, tenantId),
        eq(runtimeInstallations.origin, "local_managed"),
      ))
      .limit(1);
    if (existing) {
      const [updated] = await tx
        .update(runtimeInstallations)
        .set({ gatewayUrl: environmentRuntimeInstallation().gatewayHttpUrl, updatedAt: new Date() })
        .where(eq(runtimeInstallations.id, existing.id))
        .returning();
      return updated;
    }
    return insertEnvironmentRuntimeInstallation(tx, { tenantId, createdByUserId });
  });
}

async function mutableTenantInstallation(tenantId: string, installationId: string) {
  const [installation] = await db
    .select()
    .from(runtimeInstallations)
    .where(eq(runtimeInstallations.id, installationId))
    .limit(1);
  if (!installation)
    throw new RuntimeInstallationSelectionError(
      404,
      "Installation runtime introuvable.",
      "installation_not_found",
    );
  if (installation.tenantId !== tenantId)
    throw new RuntimeInstallationSelectionError(
      403,
      "Cette installation n’appartient pas à l’organisation.",
      "installation_forbidden",
    );
  if (
    installation.managementLevel === "external"
    || installation.archivedAt
    || installation.status === "revoked"
  )
    throw new RuntimeInstallationSelectionError(
      409,
      "Cette installation est en lecture seule et ne peut pas provisionner d’agent.",
      "installation_not_mutable",
    );
  return installation;
}

/**
 * Resolve the target of an agent provisioning request without ever borrowing a
 * runtime from another tenant. Explicit selection wins, then the calling
 * agent's installation, and only an absent source installation falls back to
 * the tenant-owned local managed runtime.
 */
export async function resolveAgentProvisioningInstallation(input: {
  tenantId: string;
  actorUserId: string;
  installationId?: string | null;
  sourceAgentId?: string | null;
}) {
  let sourceInstallationId: string | null = null;
  if (input.sourceAgentId) {
    const [source] = await db
      .select({
        tenantId: workspaces.tenantId,
        installationId: agents.runtimeInstallationId,
      })
      .from(agents)
      .innerJoin(workspaces, eq(workspaces.id, agents.workspaceId))
      .where(eq(agents.id, input.sourceAgentId))
      .limit(1);
    if (!source || source.tenantId !== input.tenantId)
      throw new RuntimeInstallationSelectionError(
        403,
        "L’agent source n’appartient pas à l’organisation.",
        "source_agent_forbidden",
      );
    sourceInstallationId = source.installationId;
  }

  if (input.installationId)
    return mutableTenantInstallation(input.tenantId, input.installationId);
  if (sourceInstallationId) {
    try {
      return await mutableTenantInstallation(input.tenantId, sourceInstallationId);
    } catch (error) {
      if (
        error instanceof RuntimeInstallationSelectionError
        && error.code === "installation_not_mutable"
      )
        throw new RuntimeInstallationSelectionError(
          409,
          "L’installation de l’agent source ne peut pas provisionner. Sélectionnez une installation connectée ou gérée.",
          "source_installation_not_mutable",
        );
      throw error;
    }
  }

  return ensureEnvironmentRuntimeInstallation(input.tenantId, input.actorUserId);
}

function resolvedDatabaseInstallation(row: typeof runtimeInstallations.$inferSelect): ResolvedRuntimeInstallation {
  const gateway = parseGatewayUrl(row.gatewayUrl);
  return {
    id: row.id,
    installationKey: row.installationKey,
    gatewayHttpUrl: gateway.toString().replace(/\/$/, ""),
    gatewayWebSocketUrl: websocketUrlFor(gateway, row.origin === "local_managed"),
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
