import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  auditEvents,
  runtimeEnrollmentTokens,
  runtimeInstallations,
  type RuntimeTransport,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { validateGatewayUrl } from "@/lib/hermes/gateway-url";
import { createEnrollmentToken, hashEnrollmentToken } from "@/lib/hermes/relay-identity";
import { canConfigureRuntime, getTenantAccessBySlug } from "@/lib/workspace";

const INSTALLATION_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role)) {
    return NextResponse.json({ error: "Seul un Owner peut enrôler un Edge." }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as {
    name?: unknown;
    installationKey?: unknown;
    transport?: unknown;
    gatewayUrl?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const installationKey = typeof body?.installationKey === "string" ? body.installationKey.trim() : "";
  if (!name || name.length > 100 || !INSTALLATION_KEY.test(installationKey)) {
    return NextResponse.json({ error: "Nom ou clé d’installation invalide." }, { status: 400 });
  }
  // Relay par défaut : c'était le seul transport enrôlable, un client existant qui
  // n'envoie pas ce champ doit garder son comportement.
  const transport: RuntimeTransport = body?.transport === "direct" ? "direct" : "relay";
  // En direct, l'URL du Edge est fournie dès maintenant et ne sera plus jamais
  // écrasée : c'est elle que la Console appellera. Elle passe par le même validateur
  // que le flux « Connecter » (schéma, hôte autorisé, pas d'identifiants dans l'URL).
  let gatewayUrl = `relay://${installationKey}`;
  if (transport === "direct") {
    try {
      gatewayUrl = validateGatewayUrl(
        typeof body?.gatewayUrl === "string" ? body.gatewayUrl.trim() : "",
      );
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : "URL du gateway invalide.",
      }, { status: 400 });
    }
  }

  const token = createEnrollmentToken();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  try {
    const installation = await db.transaction(async (tx) => {
      const [created] = await tx.insert(runtimeInstallations).values({
        tenantId: access.tenant.id,
        name,
        installationKey,
        origin: "remote_existing",
        managementLevel: "external",
        transport,
        gatewayUrl,
        status: "pending_enrollment",
        statusDetail: "En attente de l’échange du jeton à usage unique.",
        statusReason: "enrollment_required",
        createdByUserId: user.id,
      }).returning();
      await tx.insert(runtimeEnrollmentTokens).values({
        installationId: created.id,
        tokenHash: hashEnrollmentToken(token),
        expiresAt,
        createdByUserId: user.id,
      });
      await tx.insert(auditEvents).values({
        tenantId: access.tenant.id,
        workspaceId: access.workspace.id,
        actorUserId: user.id,
        action: "runtime_installation.enrollment_created",
        targetType: "runtime_installation",
        targetId: created.id,
        metadata: { expiresAt: expiresAt.toISOString(), tokenStoredInPlaintext: false },
      });
      return created;
    });
    return NextResponse.json({
      installation,
      enrollment: {
        token,
        expiresAt: expiresAt.toISOString(),
        exchangeUrl: new URL("/api/runtime/enroll", request.url).toString(),
        transport,
        // Rien à composer en direct : annoncer une URL de Relay laisserait croire
        // qu'il faut en démarrer un.
        ...(transport === "relay"
          ? { relayUrl: process.env.HERMES_RELAY_URL ?? "wss://127.0.0.1:8790/v1/relay/connect" }
          : { gatewayUrl }),
      },
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enrôlement impossible.";
    // Unicité globale de la clé : le conflit peut venir d'un autre tenant. On répond
    // 409 sans jamais laisser fuiter à qui la clé appartient.
    const duplicate = message.includes("runtime_installations_key_uidx")
      || message.includes("runtime_installations_tenant_key_uidx");
    return NextResponse.json({
      error: duplicate ? "Cette clé d’installation existe déjà." : message,
    }, { status: duplicate ? 409 : 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access || !canConfigureRuntime(access.role)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const installationId = new URL(request.url).searchParams.get("installationId") ?? "";
  const [installation] = await db.select({ id: runtimeInstallations.id }).from(runtimeInstallations).where(and(
    eq(runtimeInstallations.id, installationId),
    eq(runtimeInstallations.tenantId, access.tenant.id),
    isNull(runtimeInstallations.archivedAt),
  )).limit(1);
  if (!installation) return NextResponse.json({ error: "Installation introuvable." }, { status: 404 });
  await db.update(runtimeEnrollmentTokens).set({ revokedAt: new Date() })
    .where(eq(runtimeEnrollmentTokens.installationId, installationId));
  return NextResponse.json({ ok: true });
}
