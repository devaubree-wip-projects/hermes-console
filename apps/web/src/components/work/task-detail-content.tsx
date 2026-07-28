import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canAtLeast, getTenantAccessBySlug } from "@/lib/workspace";
import { TaskDetailView } from "@/components/work/task-detail-view";
import { getWorkTimeline, getWorkspaceWorkItem, listWorkspaceAgentTeams } from "@/modules/work/infrastructure/work-service";

export async function TaskDetailContent({ tenantSlug, taskId, embedded = false }: { tenantSlug: string; taskId: string; embedded?: boolean }) {
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) notFound();
  const canEdit = canAtLeast(access.role, "member");
  const [detail, timeline, workspaceAgents, teams] = await Promise.all([
    getWorkspaceWorkItem(access.workspace.id, taskId).catch(() => null),
    getWorkTimeline(access.workspace.id, taskId, { limit: 200, offset: 0 }).catch(() => []),
    canEdit
      ? db.select({ id: agents.id, name: agents.name, runtimeState: agents.runtimeState }).from(agents).where(eq(agents.workspaceId, access.workspace.id))
      : [],
    canEdit ? listWorkspaceAgentTeams(access.workspace.id) : [],
  ]);
  if (!detail) notFound();
  return (
    <TaskDetailView
      workspaceBase={`/${tenantSlug}`}
      detail={detail}
      timeline={timeline}
      canEdit={canEdit}
      assignOptions={canEdit ? {
        agents: workspaceAgents.map((agent) => ({ id: agent.id, name: agent.name, ready: agent.runtimeState === "ready" })),
        teams: teams.map((team) => ({ id: team.id, name: team.name })),
      } : undefined}
      embedded={embedded}
    />
  );
}
