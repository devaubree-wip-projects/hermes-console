import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditEvents, runtimeEnrollmentTokens, runtimeInstallations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
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
  const body = await request.json().catch(() => null) as { name?: unknown; installationKey?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const installationKey = typeof body?.installationKey === "string" ? body.installationKey.trim() : "";
  if (!name || name.length > 100 || !INSTALLATION_KEY.test(installationKey)) {
    return NextResponse.json({ error: "Nom ou clé d’installation invalide." }, { status: 400 });
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
        transport: "relay",
        gatewayUrl: `relay://${installationKey}`,
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
        relayUrl: process.env.HERMES_RELAY_URL ?? "wss://127.0.0.1:8790/v1/relay/connect",
      },
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enrôlement impossible.";
    return NextResponse.json({
      error: message.includes("runtime_installations_tenant_key_uidx")
        ? "Cette clé d’installation existe déjà."
        : message,
    }, { status: message.includes("runtime_installations_tenant_key_uidx") ? 409 : 400 });
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
