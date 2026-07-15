import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditEvents, runtimeBudgets, runtimeInstallations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canConfigureRuntime, getWorkspaceAccessBySlugs } from "@/lib/workspace";

function micros(value: unknown) {
  if (value === null || value === "") return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; installationId: string }> },
) {
  const { tenantSlug, workspaceSlug, installationId } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role)) return NextResponse.json({ error: "Seul un Owner peut modifier les budgets." }, { status: 403 });
  const [installation] = await db.select({ id: runtimeInstallations.id }).from(runtimeInstallations).where(and(
    eq(runtimeInstallations.id, installationId), eq(runtimeInstallations.tenantId, access.tenant.id),
  )).limit(1);
  if (!installation) return NextResponse.json({ error: "Installation introuvable." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const infrastructureLimitMicros = micros(body?.infrastructureLimitMicros);
  const inferenceLimitMicros = micros(body?.inferenceLimitMicros);
  const globalLimitMicros = micros(body?.globalLimitMicros);
  const threshold = body?.alertThresholdPercent;
  const hardCapAction = body?.hardCapAction;
  const fallbackModel = typeof body?.fallbackModel === "string" ? body.fallbackModel.trim() : "";
  if (
    infrastructureLimitMicros === undefined || inferenceLimitMicros === undefined || globalLimitMicros === undefined
    || typeof threshold !== "number" || !Number.isInteger(threshold) || threshold < 1 || threshold > 100
    || (hardCapAction !== "pause" && hardCapAction !== "owner_approval" && hardCapAction !== "fallback_model")
    || (hardCapAction === "fallback_model" && (!fallbackModel || fallbackModel.length > 200))
  ) return NextResponse.json({ error: "Politique de budget invalide." }, { status: 400 });
  const [budget] = await db.insert(runtimeBudgets).values({
    installationId,
    currency: body?.currency === "USD" ? "USD" : "EUR",
    infrastructureLimitMicros,
    inferenceLimitMicros,
    globalLimitMicros,
    alertThresholdPercent: threshold,
    softCapAction: "alert",
    hardCapAction,
    fallbackModel: hardCapAction === "fallback_model" ? fallbackModel : null,
  }).onConflictDoUpdate({
    target: runtimeBudgets.installationId,
    set: {
      currency: body?.currency === "USD" ? "USD" : "EUR",
      infrastructureLimitMicros, inferenceLimitMicros, globalLimitMicros,
      alertThresholdPercent: threshold, hardCapAction,
      fallbackModel: hardCapAction === "fallback_model" ? fallbackModel : null,
      updatedAt: new Date(),
    },
  }).returning();
  await db.insert(auditEvents).values({
    tenantId: access.tenant.id, workspaceId: access.workspace.id, actorUserId: user.id,
    action: "runtime_budget.updated", targetType: "runtime_installation", targetId: installationId,
    metadata: { currency: budget.currency, threshold: budget.alertThresholdPercent, hardCapAction: budget.hardCapAction },
  });
  return NextResponse.json({ budget });
}
