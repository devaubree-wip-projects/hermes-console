import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, auditEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  CODEX_SUBSCRIPTION_PROVIDER,
  createCodexSubscriptionService,
} from "@/lib/hermes/codex-subscription";
import { hermesFetch, HermesRuntimeError } from "@/lib/hermes/server";
import { canConfigureRuntime, getWorkspaceAccessBySlugs } from "@/lib/workspace";

type RouteParams = Promise<{
  tenantSlug: string;
  workspaceSlug: string;
  agentSlug: string;
}>;

const codex = createCodexSubscriptionService(hermesFetch);
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{6,200}$/;

async function resolveContext(
  tenantSlug: string,
  workspaceSlug: string,
  agentSlug: string,
) {
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) return { user, access: null, agent: null };
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.workspaceId, access.workspace.id), eq(agents.slug, agentSlug)))
    .limit(1);
  return { user, access, agent: agent ?? null };
}

function runtimeErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Runtime Hermes indisponible.";
  const status = error instanceof HermesRuntimeError && error.status
    ? Math.min(Math.max(error.status, 400), 599)
    : 503;
  return NextResponse.json({ error: message }, { status });
}

function invalidContextResponse(
  access: Awaited<ReturnType<typeof resolveContext>>["access"],
  agent: Awaited<ReturnType<typeof resolveContext>>["agent"],
) {
  if (!access) return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  if (!agent) return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });
  if (!canConfigureRuntime(access.role)) {
    return NextResponse.json(
      { error: "Seul un Owner peut connecter l’abonnement Codex." },
      { status: 403 },
    );
  }
  return null;
}

function sessionIdFrom(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim() ?? "";
  return SESSION_ID_PATTERN.test(sessionId) ? sessionId : null;
}

async function recordConnectedAudit(input: {
  sessionId: string;
  userId: string;
  agentId: string;
  tenantId: string;
  workspaceId: string;
}) {
  const [existing] = await db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(and(
      eq(auditEvents.action, "agent.inference.oauth_connected"),
      eq(auditEvents.targetId, input.agentId),
      sql`${auditEvents.metadata}->>'sessionId' = ${input.sessionId}`,
    ))
    .limit(1);
  if (existing) return;
  await db.insert(auditEvents).values({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    actorUserId: input.userId,
    action: "agent.inference.oauth_connected",
    targetType: "agent",
    targetId: input.agentId,
    metadata: { provider: CODEX_SUBSCRIPTION_PROVIDER, sessionId: input.sessionId },
  });
}

export async function POST(
  _: Request,
  { params }: { params: RouteParams },
) {
  const { tenantSlug, workspaceSlug, agentSlug } = await params;
  const context = await resolveContext(tenantSlug, workspaceSlug, agentSlug);
  const invalid = invalidContextResponse(context.access, context.agent);
  if (invalid) return invalid;

  try {
    const login = await codex.start(context.agent!.hermesProfileName);
    return NextResponse.json(login);
  } catch (error) {
    return runtimeErrorResponse(error);
  }
}

export async function GET(
  request: Request,
  { params }: { params: RouteParams },
) {
  const { tenantSlug, workspaceSlug, agentSlug } = await params;
  const context = await resolveContext(tenantSlug, workspaceSlug, agentSlug);
  const invalid = invalidContextResponse(context.access, context.agent);
  if (invalid) return invalid;
  const sessionId = sessionIdFrom(request);
  if (!sessionId) {
    return NextResponse.json({ error: "Session de connexion invalide." }, { status: 400 });
  }

  try {
    const status = await codex.poll(context.agent!.hermesProfileName, sessionId);
    if (status.status === "approved") {
      await recordConnectedAudit({
        sessionId,
        userId: context.user.id,
        agentId: context.agent!.id,
        tenantId: context.access!.tenant.id,
        workspaceId: context.access!.workspace.id,
      });
    }
    return NextResponse.json(status);
  } catch (error) {
    return runtimeErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: RouteParams },
) {
  const { tenantSlug, workspaceSlug, agentSlug } = await params;
  const context = await resolveContext(tenantSlug, workspaceSlug, agentSlug);
  const invalid = invalidContextResponse(context.access, context.agent);
  if (invalid) return invalid;
  const requestedSessionId = new URL(request.url).searchParams.get("sessionId");

  try {
    if (requestedSessionId !== null) {
      const sessionId = sessionIdFrom(request);
      if (!sessionId) {
        return NextResponse.json({ error: "Session de connexion invalide." }, { status: 400 });
      }
      const result = await codex.cancel(context.agent!.hermesProfileName, sessionId);
      return NextResponse.json({ ok: result.ok !== false });
    }

    const profile = context.agent!.hermesProfileName;
    const modelInfo = await hermesFetch<{ provider?: string; model?: string }>(
      `/api/model/info?${new URLSearchParams({ profile })}`,
    );
    const result = await codex.disconnect(profile);
    const currentProvider = modelInfo.provider === CODEX_SUBSCRIPTION_PROVIDER
      || modelInfo.model?.startsWith(`${CODEX_SUBSCRIPTION_PROVIDER}/`);
    if (currentProvider) {
      await db
        .update(agents)
        .set({
          runtimeState: "setup_required",
          runtimeError: "Abonnement Codex déconnecté.",
          updatedAt: new Date(),
        })
        .where(eq(agents.id, context.agent!.id));
    }
    if (result.ok !== false) {
      await db.insert(auditEvents).values({
        tenantId: context.access!.tenant.id,
        workspaceId: context.access!.workspace.id,
        actorUserId: context.user.id,
        action: "agent.inference.oauth_disconnected",
        targetType: "agent",
        targetId: context.agent!.id,
        metadata: { provider: CODEX_SUBSCRIPTION_PROVIDER },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HermesRuntimeError && error.status === 404) {
      return NextResponse.json({ ok: true });
    }
    return runtimeErrorResponse(error);
  }
}
