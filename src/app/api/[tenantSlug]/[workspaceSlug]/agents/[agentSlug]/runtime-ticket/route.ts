import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { createRuntimeTicket } from "@/lib/hermes/runtime-ticket";
import { getWorkspaceAccessBySlugs } from "@/lib/workspace";

export async function POST(_: Request, { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; agentSlug: string }> }) {
  const { tenantSlug, workspaceSlug, agentSlug } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  const [agent] = await db.select().from(agents).where(and(eq(agents.workspaceId, access.workspace.id), eq(agents.slug, agentSlug))).limit(1);
  if (!agent) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });
  return NextResponse.json({ ticket: createRuntimeTicket({
    userId: user.id,
    tenantId: access.tenant.id,
    workspaceId: access.workspace.id,
    agentId: agent.id,
    profile: agent.hermesProfileName,
    role: access.role,
  }) });
}
