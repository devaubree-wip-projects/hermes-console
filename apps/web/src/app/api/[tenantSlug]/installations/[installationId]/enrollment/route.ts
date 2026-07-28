import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  auditEvents,
  runtimeEnrollmentTokens,
  runtimeIdentities,
  runtimeInstallations,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { createEnrollmentToken, hashEnrollmentToken } from "@/lib/hermes/relay-identity";
import { canConfigureRuntime, getTenantAccessBySlug } from "@/lib/workspace";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; installationId: string }> },
) {
  const { tenantSlug, installationId } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role)) return NextResponse.json({ error: "Seul un Owner peut renouveler l’identité." }, { status: 403 });
  // Plus de filtre sur le transport : une identité enrôlée se renouvelle de la même
  // façon en direct et en relay, seul le tunnel diffère. Le restreindre au relay
  // laisserait une installation directe sans aucun moyen de tourner son secret.
  const [installation] = await db.select().from(runtimeInstallations).where(and(
    eq(runtimeInstallations.id, installationId),
    eq(runtimeInstallations.tenantId, access.tenant.id),
    isNull(runtimeInstallations.archivedAt),
  )).limit(1);
  if (!installation) return NextResponse.json({ error: "Installation introuvable." }, { status: 404 });
  const token = createEnrollmentToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  await db.transaction(async (tx) => {
    await tx.update(runtimeEnrollmentTokens).set({ revokedAt: now }).where(and(
      eq(runtimeEnrollmentTokens.installationId, installationId),
      isNull(runtimeEnrollmentTokens.consumedAt),
      isNull(runtimeEnrollmentTokens.revokedAt),
    ));
    await tx.update(runtimeIdentities).set({ status: "rotating", updatedAt: now }).where(and(
      eq(runtimeIdentities.installationId, installationId),
      eq(runtimeIdentities.status, "active"),
    ));
    await tx.insert(runtimeEnrollmentTokens).values({
      installationId,
      tokenHash: hashEnrollmentToken(token),
      expiresAt,
      createdByUserId: user.id,
    });
    await tx.insert(auditEvents).values({
      tenantId: access.tenant.id,
      workspaceId: access.workspace.id,
      actorUserId: user.id,
      action: "runtime_identity.rotation_started",
      targetType: "runtime_installation",
      targetId: installationId,
      metadata: { expiresAt: expiresAt.toISOString() },
    });
  });
  return NextResponse.json({ enrollment: {
    token,
    expiresAt: expiresAt.toISOString(),
    exchangeUrl: new URL("/api/runtime/enroll", request.url).toString(),
    relayUrl: process.env.HERMES_RELAY_URL ?? "wss://127.0.0.1:8790/v1/relay/connect",
  } });
}
