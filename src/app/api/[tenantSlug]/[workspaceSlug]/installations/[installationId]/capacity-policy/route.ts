import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditEvents, runtimeCapabilities, runtimeInstallations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canConfigureRuntime, getWorkspaceAccessBySlugs } from "@/lib/workspace";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; installationId: string }> },
) {
  const { tenantSlug, workspaceSlug, installationId } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role)) return NextResponse.json({ error: "Seul un Owner peut modifier la capacité." }, { status: 403 });
  const [[installation], [capability]] = await Promise.all([
    db.select({ id: runtimeInstallations.id }).from(runtimeInstallations).where(and(eq(runtimeInstallations.id, installationId), eq(runtimeInstallations.tenantId, access.tenant.id))).limit(1),
    db.select().from(runtimeCapabilities).where(eq(runtimeCapabilities.installationId, installationId)).limit(1),
  ]);
  if (!installation || !capability) return NextResponse.json({ error: "Installation ou capacités introuvables." }, { status: 404 });
  const body = await request.json().catch(() => null) as { headroomPercent?: unknown; maxActiveSessions?: unknown } | null;
  const headroomPercent = body?.headroomPercent;
  const maxActiveSessions = body?.maxActiveSessions;
  if (typeof headroomPercent !== "number" || !Number.isInteger(headroomPercent) || headroomPercent < 5 || headroomPercent > 80
    || typeof maxActiveSessions !== "number" || !Number.isInteger(maxActiveSessions) || maxActiveSessions < 1 || maxActiveSessions > 100_000) {
    return NextResponse.json({ error: "Politique de capacité invalide." }, { status: 400 });
  }
  const limits = { ...(capability.limits ?? {}), headroomPercent, maxActiveSessions };
  await db.update(runtimeCapabilities).set({ limits, updatedAt: new Date() }).where(eq(runtimeCapabilities.id, capability.id));
  await db.insert(auditEvents).values({
    tenantId: access.tenant.id, workspaceId: access.workspace.id, actorUserId: user.id,
    action: "runtime_capacity.policy_updated", targetType: "runtime_installation", targetId: installationId,
    metadata: { headroomPercent, maxActiveSessions },
  });
  return NextResponse.json({ limits });
}
