import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getTenantAccessBySlug } from "@/lib/workspace";
import { AgentCreationError, createAgent } from "@/modules/agents/application/create-agent";

export async function POST(request: Request, { params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";
  const description = typeof body?.description === "string" ? body.description : "";
  const installationId = typeof body?.installationId === "string" ? body.installationId : null;
  const sourceAgentId = typeof body?.sourceAgentId === "string" ? body.sourceAgentId : null;
  const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey : null;

  try {
    const result = await createAgent({
      access,
      actorUserId: user.id,
      name,
      description,
      installationId,
      sourceAgentId,
      idempotencyKey,
      origin: {
        source: "console",
        sourceAgentId,
        idempotencyKey,
      },
    });
    const response = {
      agent: result.agent,
      runtimeState: result.runtimeState,
      runtimeError: result.runtimeError,
      installationId: result.installationId,
      redirectTo: `/${tenantSlug}/d/chat?agentId=${encodeURIComponent(result.agent.id)}`,
      reused: result.reused,
    };
    if (result.runtimeState !== "ready")
      return NextResponse.json(
        {
          ...response,
          error: result.runtimeError ?? "Le runtime n’a pas pu provisionner cet agent.",
          code: "agent_provisioning_failed",
        },
        { status: 502 },
      );
    return NextResponse.json(
      response,
      { status: result.reused ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof AgentCreationError)
      return NextResponse.json(
        { error: error.message, ...(error.code ? { code: error.code } : {}) },
        { status: error.status },
      );
    throw error;
  }
}
