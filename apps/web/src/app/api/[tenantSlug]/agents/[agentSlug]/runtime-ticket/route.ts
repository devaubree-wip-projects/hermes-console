import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, runtimeBudgets, runtimeUsageSamples } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { createRuntimeTicket } from "@/lib/hermes/runtime-ticket";
import { runtimeInstallationForAgent } from "@/lib/hermes/installations";
import { evaluateInferenceBudget } from "@/lib/hermes/runtime-policy";
import { getTenantAccessBySlug } from "@/lib/workspace";

export async function POST(_: Request, { params }: { params: Promise<{ tenantSlug: string; agentSlug: string }> }) {
  const { tenantSlug, agentSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  const [agent] = await db.select().from(agents).where(and(eq(agents.workspaceId, access.workspace.id), eq(agents.slug, agentSlug))).limit(1);
  if (!agent) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });
  const installation = await runtimeInstallationForAgent(agent.id);
  const [budget, usage] = agent.runtimeInstallationId ? await Promise.all([
    db.select().from(runtimeBudgets).where(eq(runtimeBudgets.installationId, agent.runtimeInstallationId)).limit(1).then((rows) => rows[0] ?? null),
    db.select().from(runtimeUsageSamples).where(eq(runtimeUsageSamples.installationId, agent.runtimeInstallationId))
      .orderBy(desc(runtimeUsageSamples.sampledAt)).limit(1).then((rows) => rows[0] ?? null),
  ]) : [null, null];
  const budgetDecision = evaluateInferenceBudget(budget, usage, access.role);
  if (!budgetDecision.allowed) {
    return NextResponse.json({
      error: "Le hard cap d’inférence est atteint. Une action Owner explicite est requise.",
      code: budgetDecision.reason,
      budget: budgetDecision,
    }, { status: 402 });
  }
  return NextResponse.json({
    gatewayUrl: installation.gatewayWebSocketUrl,
    ticket: await createRuntimeTicket({
    userId: user.id,
    tenantId: access.tenant.id,
    workspaceId: access.workspace.id,
    agentId: agent.id,
    installationKey: installation.installationKey,
    profile: agent.hermesProfileName,
    role: access.role,
    modelOverride: budgetDecision.action === "fallback_model" ? budget?.fallbackModel ?? undefined : undefined,
  }),
    budgetWarning: budgetDecision.warning ? budgetDecision : null,
  });
}
