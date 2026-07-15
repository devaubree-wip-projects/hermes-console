import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, auditEvents, runtimeCapabilities, runtimeUsageSamples } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { createHermesProfile, HermesRuntimeError } from "@/lib/hermes/server";
import { ensureEnvironmentRuntimeInstallation } from "@/lib/hermes/installations";
import { capacityRecommendationFromUsage } from "@/lib/hermes/runtime-policy";
import { allocateAgentIdentity } from "@/lib/product-model";
import { canConfigureRuntime, getWorkspaceAccessBySlugs } from "@/lib/workspace";

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> }) {
  const { tenantSlug, workspaceSlug } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role)) return NextResponse.json({ error: "Seul un Owner peut créer un agent." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!name || name.length > 80 || description.length > 500) return NextResponse.json({ error: "Nom ou mission invalide." }, { status: 400 });

  const identity = await allocateAgentIdentity(access.workspace.id, access.tenant.slug, access.workspace.slug, name);
  const installation = await ensureEnvironmentRuntimeInstallation(access.tenant.id, user.id);
  const [[capability], [latestUsage]] = await Promise.all([
    db.select().from(runtimeCapabilities).where(eq(runtimeCapabilities.installationId, installation.id)).limit(1),
    db.select().from(runtimeUsageSamples).where(eq(runtimeUsageSamples.installationId, installation.id))
      .orderBy(desc(runtimeUsageSamples.sampledAt)).limit(1),
  ]);
  if (latestUsage && capability?.limits?.maxActiveSessions && (latestUsage.activeSessionCount ?? 0) >= capability.limits.maxActiveSessions) {
    return NextResponse.json({ error: "Capacité de sessions active atteinte.", code: "active_session_capacity_reached" }, { status: 409 });
  }
  if (latestUsage && capacityRecommendationFromUsage(latestUsage, capability?.limits?.headroomPercent ?? 20).saturated) {
    return NextResponse.json({ error: "Headroom runtime insuffisant pour créer un nouvel agent.", code: "capacity_headroom_exceeded" }, { status: 409 });
  }
  let runtimeState: "ready" | "setup_required" | "error" = "ready";
  let runtimeError: string | null = null;
  try {
    await createHermesProfile(
      { name: identity.profileName, description },
      { installationId: installation.id, profile: identity.profileName },
    );
  } catch (error) {
    runtimeState = error instanceof HermesRuntimeError && !error.status ? "setup_required" : "error";
    runtimeError = error instanceof Error ? error.message.slice(0, 500) : "Création du profil Hermes impossible.";
  }

  const [agent] = await db.insert(agents).values({
    workspaceId: access.workspace.id,
    runtimeInstallationId: installation.id,
    slug: identity.slug,
    name,
    description: description || null,
    hermesProfileName: identity.profileName,
    runtimeState,
    runtimeError,
    createdByUserId: user.id,
  }).returning();
  await db.insert(auditEvents).values({
    tenantId: access.tenant.id,
    workspaceId: access.workspace.id,
    actorUserId: user.id,
    action: "agent.created",
    targetType: "agent",
    targetId: agent.id,
    metadata: { profile: identity.profileName, runtimeState },
  });

  return NextResponse.json(
    {
      agent,
      redirectTo: `/${tenantSlug}/${workspaceSlug}/d/chat?agentId=${encodeURIComponent(agent.id)}`,
    },
    { status: 201 },
  );
}
