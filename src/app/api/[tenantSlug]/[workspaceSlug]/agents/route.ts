import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, auditEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { createHermesProfile, HermesRuntimeError } from "@/lib/hermes/server";
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
  let runtimeState: "ready" | "setup_required" | "error" = "ready";
  let runtimeError: string | null = null;
  try {
    await createHermesProfile({ name: identity.profileName, description });
  } catch (error) {
    runtimeState = error instanceof HermesRuntimeError && !error.status ? "setup_required" : "error";
    runtimeError = error instanceof Error ? error.message.slice(0, 500) : "Création du profil Hermes impossible.";
  }

  const [agent] = await db.insert(agents).values({
    workspaceId: access.workspace.id,
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
