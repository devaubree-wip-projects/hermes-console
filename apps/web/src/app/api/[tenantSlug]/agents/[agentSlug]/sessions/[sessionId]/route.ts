import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, agentSessions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { hermesFetch } from "@/lib/hermes/server";
import {
  normalizeStoredHistory,
  type HermesStoredMessage,
} from "@/lib/hermes/stored-history";
import { canAtLeast, getTenantAccessBySlug } from "@/lib/workspace";

async function resolveContext(
  tenantSlug: string,
  agentSlug: string,
) {
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) return { access: null, agent: null };
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.workspaceId, access.workspace.id), eq(agents.slug, agentSlug)))
    .limit(1);
  return { access, agent: agent ?? null };
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ tenantSlug: string; agentSlug: string; sessionId: string }> },
) {
  const { tenantSlug, agentSlug, sessionId } = await params;
  const { access, agent } = await resolveContext(tenantSlug, agentSlug);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!agent) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });

  const query = new URLSearchParams({ profile: agent.hermesProfileName });
  const result = await hermesFetch<{ messages?: HermesStoredMessage[] }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/messages?${query}`,
    {},
    { agentId: agent.id, profile: agent.hermesProfileName },
  );

  return NextResponse.json({
    messages: normalizeStoredHistory(result.messages),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; agentSlug: string; sessionId: string }> },
) {
  const { tenantSlug, agentSlug, sessionId } = await params;
  const { access, agent } = await resolveContext(tenantSlug, agentSlug);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!agent) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });
  if (!canAtLeast(access.role, "member")) return NextResponse.json({ error: "Accès en lecture seule." }, { status: 403 });

  const body = await request.json().catch(() => null) as { title?: unknown; archived?: unknown } | null;
  const payload: { profile: string; title?: string; archived?: boolean } = {
    profile: agent.hermesProfileName,
  };
  if (typeof body?.title === "string") payload.title = body.title.slice(0, 200);
  if (typeof body?.archived === "boolean") payload.archived = body.archived;
  if (payload.title === undefined && payload.archived === undefined) {
    return NextResponse.json({ error: "Aucune modification fournie." }, { status: 400 });
  }

  const result = await hermesFetch<Record<string, unknown>>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, { agentId: agent.id, profile: agent.hermesProfileName });
  return NextResponse.json(result);
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ tenantSlug: string; agentSlug: string; sessionId: string }> },
) {
  const { tenantSlug, agentSlug, sessionId } = await params;
  const { access, agent } = await resolveContext(tenantSlug, agentSlug);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!agent) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });
  if (!canAtLeast(access.role, "member")) return NextResponse.json({ error: "Accès en lecture seule." }, { status: 403 });

  const query = new URLSearchParams({ profile: agent.hermesProfileName });
  const result = await hermesFetch<Record<string, unknown>>(
    `/api/sessions/${encodeURIComponent(sessionId)}?${query}`,
    { method: "DELETE" },
    { agentId: agent.id, profile: agent.hermesProfileName },
  );
  await db.delete(agentSessions).where(and(
    eq(agentSessions.agentId, agent.id),
    eq(agentSessions.hermesSessionId, sessionId),
  ));
  return NextResponse.json(result);
}
