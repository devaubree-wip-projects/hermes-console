import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  hermesFetch,
  listHermesSessions,
  readLocalProfileGatewaySession,
  type HermesSessionRow,
} from "@/lib/hermes/server";
import {
  buildSessionMetrics,
  type HermesGatewaySessionSnapshot,
  type HermesModelContextInfo,
  type HermesSessionMetricsRow,
} from "@/lib/hermes/session-metrics";
import { getWorkspaceAccessBySlugs } from "@/lib/workspace";

export async function GET(
  _: Request,
  { params }: {
    params: Promise<{
      tenantSlug: string;
      workspaceSlug: string;
      agentSlug: string;
      sessionId: string;
    }>;
  },
) {
  const { tenantSlug, workspaceSlug, agentSlug, sessionId } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(
    tenantSlug,
    workspaceSlug,
    user.id,
  );
  if (!access) {
    return NextResponse.json({ error: "Workspace introuvable." }, { status: 404 });
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(
      eq(agents.workspaceId, access.workspace.id),
      eq(agents.slug, agentSlug),
    ))
    .limit(1);
  if (!agent) {
    return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });
  }

  const profile = agent.hermesProfileName;
  const profileQuery = new URLSearchParams({ profile });
  const [row, recent, modelInfo, gateway] = await Promise.all([
    hermesFetch<HermesSessionMetricsRow>(
      `/api/sessions/${encodeURIComponent(sessionId)}?${profileQuery}`,
    ),
    listHermesSessions(profile, 100),
    hermesFetch<HermesModelContextInfo>(`/api/model/info?${profileQuery}`),
    readLocalProfileGatewaySession(profile, sessionId),
  ]);
  const recentRow = recent.sessions.find((session: HermesSessionRow) => (
    (session.id ?? session.session_id) === sessionId
  ));

  return NextResponse.json(buildSessionMetrics({
    row,
    recentLastActive: recentRow?.last_active,
    gateway: gateway as HermesGatewaySessionSnapshot | null,
    modelInfo,
  }));
}
