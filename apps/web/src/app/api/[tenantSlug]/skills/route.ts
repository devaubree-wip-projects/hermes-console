import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { hermesFetch, HermesRuntimeError, runtimeErrorMessage } from "@/lib/hermes/server";
import { canConfigureRuntime, getTenantAccessBySlug } from "@/lib/workspace";

// Create a new custom skill for the workspace's primary Hermes profile. The
// runtime (`POST /api/skills`) runs the same validated write path as the agent
// `skill_manage` tool (frontmatter validation, size limit, security scan), so
// this route stays a thin, owner-gated proxy.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access)
    return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role))
    return NextResponse.json(
      { error: "Seul un Owner peut créer un skill." },
      { status: 403 },
    );

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const content = typeof body?.content === "string" ? body.content : "";
  const category =
    typeof body?.category === "string" && body.category.trim()
      ? body.category.trim()
      : undefined;
  if (
    !name ||
    name.length > 200 ||
    name.includes("..") ||
    name.includes("/") ||
    name.includes("\\")
  )
    return NextResponse.json({ error: "Nom de skill invalide." }, { status: 400 });
  if (!content || content.length > 100_000)
    return NextResponse.json({ error: "Contenu de skill invalide." }, { status: 400 });

  const [agent] = await db
    .select({ id: agents.id, hermesProfileName: agents.hermesProfileName })
    .from(agents)
    .where(eq(agents.workspaceId, access.workspace.id))
    .orderBy(asc(agents.createdAt))
    .limit(1);
  if (!agent)
    return NextResponse.json(
      { error: "Aucun agent disponible dans ce workspace." },
      { status: 404 },
    );

  try {
    const result = await hermesFetch<Record<string, unknown>>(
      "/api/skills",
      {
        method: "POST",
        body: JSON.stringify({
          name,
          content,
          category,
          profile: agent.hermesProfileName,
        }),
      },
      { agentId: agent.id, profile: agent.hermesProfileName },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const status =
      error instanceof HermesRuntimeError && error.status ? error.status : 502;
    return NextResponse.json(
      { error: runtimeErrorMessage(error, "Runtime Hermes indisponible.") },
      { status },
    );
  }
}
