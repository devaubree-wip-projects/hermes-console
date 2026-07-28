import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, agentSessions, auditEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { listHermesSessions } from "@/lib/hermes/server";
import { canAtLeast, getTenantAccessBySlug } from "@/lib/workspace";

async function resolveAgent(
  tenantSlug: string,
  agentSlug: string,
) {
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) return { user, access: null, agent: null };
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.workspaceId, access.workspace.id), eq(agents.slug, agentSlug)))
    .limit(1);
  return { user, access, agent: agent ?? null };
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ tenantSlug: string; agentSlug: string }> },
) {
  const { tenantSlug, agentSlug } = await params;
  const { access, agent } = await resolveAgent(tenantSlug, agentSlug);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!agent) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });

  const result = await listHermesSessions(agent.hermesProfileName, 100, { agentId: agent.id });
  return NextResponse.json({
    sessions: result.sessions.map((session) => ({
      id: session.id ?? session.session_id,
      title: session.title ?? "",
      source: session.source ?? null,
      startedAt: session.started_at ?? null,
      lastActiveAt: session.last_active ?? session.started_at ?? null,
      messageCount: session.message_count ?? 0,
      archived: session.archived === true,
    })).filter((session): session is typeof session & { id: string } => Boolean(session.id)),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string; agentSlug: string }> }) {
  const { tenantSlug, agentSlug } = await params;
  const { user, access, agent } = await resolveAgent(tenantSlug, agentSlug);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canAtLeast(access.role, "member")) return NextResponse.json({ error: "Accès en lecture seule." }, { status: 403 });
  if (!agent) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });
  const body = await request.json().catch(() => null);
  const hermesSessionId = typeof body?.hermesSessionId === "string" ? body.hermesSessionId.trim() : "";
  if (!hermesSessionId || hermesSessionId === "new" || hermesSessionId.length > 200) return NextResponse.json({ ok: true });
  const [session] = await db.insert(agentSessions).values({
    agentId: agent.id,
    hermesSessionId,
    title: typeof body?.title === "string" ? body.title.slice(0, 200) : null,
    createdByUserId: user.id,
  }).onConflictDoUpdate({
    target: [agentSessions.agentId, agentSessions.hermesSessionId],
    set: { lastActivityAt: new Date() },
  }).returning();
  await db.insert(auditEvents).values({
    tenantId: access.tenant.id,
    workspaceId: access.workspace.id,
    actorUserId: user.id,
    action: "session.opened",
    targetType: "agent_session",
    targetId: session.id,
    metadata: { agentId: agent.id, hermesSessionId },
  });
  return NextResponse.json({ ok: true, sessionId: session.id });
}
