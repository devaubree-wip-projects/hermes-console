import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  auditEvents,
  runtimeCapabilities,
  runtimeInstallations,
  runtimeOperations,
  runtimeUsageSamples,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { probeGateway } from "@/lib/hermes/gateway-preflight";
import { runtimeInstallationById } from "@/lib/hermes/installations";
import { capacityRecommendation, capacitySample } from "@/lib/hermes/runtime-policy";
import { listHermesSessions, runHermesInstallationCommand } from "@/lib/hermes/server";
import { canConfigureRuntime, getWorkspaceAccessBySlugs } from "@/lib/workspace";

const LIFECYCLE = ["start", "restart", "stop", "drain", "resume"] as const;
type LifecycleAction = typeof LIFECYCLE[number];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; installationId: string }> },
) {
  const { tenantSlug, workspaceSlug, installationId } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  const [installation] = await db.select({ id: runtimeInstallations.id }).from(runtimeInstallations).where(and(
    eq(runtimeInstallations.id, installationId), eq(runtimeInstallations.tenantId, access.tenant.id),
  )).limit(1);
  if (!installation) return NextResponse.json({ error: "Installation introuvable." }, { status: 404 });
  const operations = await db.select().from(runtimeOperations).where(eq(runtimeOperations.installationId, installationId))
    .orderBy(desc(runtimeOperations.createdAt)).limit(100);
  return NextResponse.json({ operations });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; installationId: string }> },
) {
  const { tenantSlug, workspaceSlug, installationId } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (access.role === "viewer") return NextResponse.json({ error: "Le rôle Viewer est en lecture seule." }, { status: 403 });
  const [[installation], [capability]] = await Promise.all([
    db.select().from(runtimeInstallations).where(and(
      eq(runtimeInstallations.id, installationId), eq(runtimeInstallations.tenantId, access.tenant.id),
    )).limit(1),
    db.select().from(runtimeCapabilities).where(eq(runtimeCapabilities.installationId, installationId)).limit(1),
  ]);
  if (!installation) return NextResponse.json({ error: "Installation introuvable." }, { status: 404 });
  const body = await request.json().catch(() => null) as { type?: unknown; profile?: unknown; confirmed?: unknown } | null;
  const type = typeof body?.type === "string" ? body.type : "";
  const profile = typeof body?.profile === "string" ? body.profile : capability?.profiles[0]?.name ?? "default";
  const isLifecycle = LIFECYCLE.includes(type as LifecycleAction);
  if (type !== "collect_capacity" && !isLifecycle) return NextResponse.json({ error: "Opération non supportée." }, { status: 400 });
  if (isLifecycle && !canConfigureRuntime(access.role)) {
    return NextResponse.json({ error: "Seul un Owner peut piloter le lifecycle Hermes." }, { status: 403 });
  }
  if (["restart", "stop", "drain"].includes(type) && body?.confirmed !== true) {
    return NextResponse.json({ error: "Confirmation explicite requise pour cette opération." }, { status: 400 });
  }
  if (isLifecycle && (installation.managementLevel === "external" || !capability?.lifecycle.includes(type))) {
    return NextResponse.json({ error: "Cette capacité de lifecycle n’a pas été accordée par le Edge." }, { status: 403 });
  }
  if (isLifecycle && !capability?.profiles.some((candidate) => candidate.name === profile)) {
    return NextResponse.json({ error: "Profil non découvert sur cette installation." }, { status: 400 });
  }
  const startedAt = new Date();
  const [operation] = await db.insert(runtimeOperations).values({
    installationId, workspaceId: access.workspace.id, type, status: "running", initiatedByUserId: user.id,
    startedAt, steps: [{ name: "validation", status: "succeeded" }, { name: type, status: "running" }],
  }).returning();
  try {
    let result: Record<string, unknown> = { ok: true };
    if (type === "collect_capacity") {
      const probe = await probeGateway(installation.gatewayUrl, installation.installationKey);
      const sample = capacitySample(probe.system, probe.profiles.length);
      const sessionLists = await Promise.all(probe.profiles.slice(0, 50).map((candidate) =>
        listHermesSessions(candidate.name, 100, { installationId }),
      ));
      const sessions = sessionLists.flatMap((list) => list.sessions);
      const estimatedCostUSD = sessions.reduce((total, session) => total + (
        typeof session.estimated_cost_usd === "number" && Number.isFinite(session.estimated_cost_usd)
          ? Math.max(0, session.estimated_cost_usd)
          : 0
      ), 0);
      const [usage] = await db.insert(runtimeUsageSamples).values({
        installationId,
        ...sample,
        activeSessionCount: sessions.filter((session) => session.is_active === true).length,
        inferenceCostMicros: Math.round(estimatedCostUSD * 1_000_000),
        costCurrency: "USD",
        costSource: "estimated",
        confidence: "medium",
      }).returning();
      await db.update(runtimeInstallations).set({
        status: probe.status, statusReason: probe.statusReason, statusDetail: probe.statusDetail,
        lastSeenAt: probe.lastSeenAt, hermesVersion: probe.hermesVersion, updatedAt: new Date(),
      }).where(eq(runtimeInstallations.id, installationId));
      result = { usage, capacity: capacityRecommendation(sample) };
    } else {
      const resolved = await runtimeInstallationById(installationId);
      await runHermesInstallationCommand(resolved, profile, type as LifecycleAction);
    }
    const completedAt = new Date();
    const [completed] = await db.update(runtimeOperations).set({
      status: "succeeded", completedAt,
      steps: [{ name: "validation", status: "succeeded" }, { name: type, status: "succeeded" }],
    }).where(eq(runtimeOperations.id, operation.id)).returning();
    await db.insert(auditEvents).values({
      tenantId: access.tenant.id, workspaceId: access.workspace.id, actorUserId: user.id,
      action: `runtime_operation.${type}`, targetType: "runtime_installation", targetId: installationId,
      metadata: { operationId: operation.id, profile },
    });
    return NextResponse.json({ operation: completed, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Opération impossible.";
    const [failed] = await db.update(runtimeOperations).set({
      status: "failed", completedAt: new Date(), errorCode: "runtime_operation_failed", errorMessage: message,
      steps: [{ name: "validation", status: "succeeded" }, { name: type, status: "failed", detail: message }],
    }).where(eq(runtimeOperations.id, operation.id)).returning();
    return NextResponse.json({ error: message, operation: failed }, { status: 502 });
  }
}
