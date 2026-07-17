import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAtLeast, getTenantAccessBySlug } from "@/lib/workspace";
import { TaskDetailView } from "@/components/work/task-detail-view";
import { getWorkTimeline, getWorkspaceWorkItem } from "@/modules/work/infrastructure/work-service";

export async function TaskDetailContent({ tenantSlug, taskId, embedded = false }: { tenantSlug: string; taskId: string; embedded?: boolean }) {
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) notFound();
  const [detail, timeline] = await Promise.all([
    getWorkspaceWorkItem(access.workspace.id, taskId).catch(() => null),
    getWorkTimeline(access.workspace.id, taskId, { limit: 200, offset: 0 }).catch(() => []),
  ]);
  if (!detail) notFound();
  return (
    <TaskDetailView
      workspaceBase={`/${tenantSlug}`}
      detail={detail}
      timeline={timeline}
      canEdit={canAtLeast(access.role, "member")}
      embedded={embedded}
    />
  );
}
