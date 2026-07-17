import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { hermesFetch, HermesRuntimeError } from "@/lib/hermes/server";
import { canConfigureRuntime, getTenantAccessBySlug } from "@/lib/workspace";

type HermesSkillContent = {
  name?: unknown;
  content?: unknown;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
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

// Full rewrite of an existing skill's SKILL.md (runtime `PUT /api/skills/content`).
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role))
    return NextResponse.json({ error: "Seul un Owner peut modifier un skill." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const content = typeof body?.content === "string" ? body.content : "";
  if (!name || name.length > 200 || name.includes("..") || name.includes("/") || name.includes("\\"))
    return NextResponse.json({ error: "Nom de skill invalide." }, { status: 400 });
  if (!content || content.length > 100_000)
    return NextResponse.json({ error: "Contenu de skill invalide." }, { status: 400 });

  const [agent] = await db
    .select({ id: agents.id, hermesProfileName: agents.hermesProfileName })
    .from(agents)
    .where(eq(agents.workspaceId, access.workspace.id))
    .orderBy(asc(agents.createdAt))
    .limit(1);
  if (!agent) return NextResponse.json({ error: "Aucun agent disponible dans ce workspace." }, { status: 404 });

  try {
    const result = await hermesFetch<Record<string, unknown>>(
      "/api/skills/content",
      { method: "PUT", body: JSON.stringify({ name, content, profile: agent.hermesProfileName }) },
      { agentId: agent.id, profile: agent.hermesProfileName },
    );
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof HermesRuntimeError && error.status ? error.status : 502;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Runtime Hermes indisponible." },
      { status },
    );
  }
}
