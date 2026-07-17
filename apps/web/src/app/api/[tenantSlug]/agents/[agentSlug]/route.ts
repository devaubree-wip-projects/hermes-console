import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  agents,
  agentTeams,
  auditEvents,
  workInterventions,
  workRuns,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canConfigureRuntime, getTenantAccessBySlug } from "@/lib/workspace";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; agentSlug: string }> },
) {
  const { tenantSlug, agentSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access)
    return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role))
    return NextResponse.json(
      { error: "Seul un Owner peut modifier un agent." },
      { status: 403 },
    );

  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.workspaceId, access.workspace.id), eq(agents.slug, agentSlug)),
    )
    .limit(1);
  if (!agent)
    return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description =
    typeof body?.description === "string" ? body.description.trim() : "";
  if (!name || name.length > 80 || description.length > 500)
    return NextResponse.json({ error: "Nom ou mission invalide." }, { status: 400 });

  const [updated] = await db
    .update(agents)
    .set({ name, description: description || null, updatedAt: new Date() })
    .where(eq(agents.id, agent.id))
    .returning();

  await db.insert(auditEvents).values({
    tenantId: access.tenant.id,
    workspaceId: access.workspace.id,
    actorUserId: user.id,
    action: "agent.updated",
    targetType: "agent",
    targetId: agent.id,
    metadata: { name },
  });

  return NextResponse.json({ agent: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tenantSlug: string; agentSlug: string }> },
) {
  const { tenantSlug, agentSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access)
    return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role))
    return NextResponse.json(
      { error: "Seul un Owner peut supprimer un agent." },
      { status: 403 },
    );

  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.workspaceId, access.workspace.id), eq(agents.slug, agentSlug)),
    )
    .limit(1);
  if (!agent)
    return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });

  // The schema pins three FKs to `restrict`; a raw delete would throw a
  // constraint error, so guard each and return a clear 409 instead.
  const [leadTeam] = await db
    .select({ name: agentTeams.name })
    .from(agentTeams)
    .where(
      and(eq(agentTeams.leadAgentId, agent.id), isNull(agentTeams.archivedAt)),
    )
    .limit(1);
  if (leadTeam)
    return NextResponse.json(
      {
        error: `Cet agent est le lead de l’équipe « ${leadTeam.name} ». Réassignez ou supprimez l’équipe d’abord.`,
      },
      { status: 409 },
    );

  const [run] = await db
    .select({ id: workRuns.id })
    .from(workRuns)
    .where(eq(workRuns.agentId, agent.id))
    .limit(1);
  if (run)
    return NextResponse.json(
      {
        error:
          "Cet agent a un historique d’exécutions et ne peut pas être supprimé.",
      },
      { status: 409 },
    );

  const [intervention] = await db
    .select({ id: workInterventions.id })
    .from(workInterventions)
    .where(eq(workInterventions.agentId, agent.id))
    .limit(1);
  if (intervention)
    return NextResponse.json(
      {
        error:
          "Cet agent a des interventions enregistrées et ne peut pas être supprimé.",
      },
      { status: 409 },
    );

  // Console-only delete: the Hermes profile stays on the runtime (the gateway
  // exposes no profile-delete route). Cascade/set-null FKs clean up sessions,
  // team memberships and assignments automatically.
  await db.delete(agents).where(eq(agents.id, agent.id));

  await db.insert(auditEvents).values({
    tenantId: access.tenant.id,
    workspaceId: access.workspace.id,
    actorUserId: user.id,
    action: "agent.deleted",
    targetType: "agent",
    targetId: agent.id,
    metadata: { name: agent.name },
  });

  return NextResponse.json({ ok: true });
}
