import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { hermesFetch, HermesRuntimeError } from "@/lib/hermes/server";
import { getWorkspaceAccessBySlugs } from "@/lib/workspace";

type HermesSkillContent = {
  name?: unknown;
  content?: unknown;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> },
) {
  const { tenantSlug, workspaceSlug } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });

  const name = new URL(request.url).searchParams.get("name")?.trim() ?? "";
  if (!name || name.length > 200 || name.includes("..") || name.includes("/") || name.includes("\\")) {
    return NextResponse.json({ error: "Nom de skill invalide." }, { status: 400 });
  }

  const [agent] = await db
    .select({ id: agents.id, hermesProfileName: agents.hermesProfileName })
    .from(agents)
    .where(eq(agents.workspaceId, access.workspace.id))
    .orderBy(asc(agents.createdAt))
    .limit(1);
  if (!agent) return NextResponse.json({ error: "Aucun agent disponible dans ce workspace." }, { status: 404 });

  try {
    const query = new URLSearchParams({ name, profile: agent.hermesProfileName });
    const result = await hermesFetch<HermesSkillContent>(
      `/api/skills/content?${query}`,
      {},
      { agentId: agent.id, profile: agent.hermesProfileName },
    );
    if (typeof result.content !== "string") {
      return NextResponse.json({ error: "Hermes a renvoyé un contenu de skill invalide." }, { status: 502 });
    }
    return NextResponse.json({ name: typeof result.name === "string" ? result.name : name, content: result.content });
  } catch (error) {
    const status = error instanceof HermesRuntimeError && error.status === 404 ? 404 : 502;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de charger ce skill." },
      { status },
    );
  }
}
