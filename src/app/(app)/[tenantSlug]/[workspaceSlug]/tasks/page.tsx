import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { normalizePermissions } from "@/lib/permissions";
import { TASK_TEMPLATES } from "@/lib/task-templates";
import { canAtLeast, getWorkspaceAccessBySlugs } from "@/lib/workspace";
import { PageHeading } from "@/components/product/page-heading";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { TaskTemplateGrid } from "@/components/tasks/task-template-grid";

export default async function TasksPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; workspaceSlug: string }>;
}) {
  const { tenantSlug, workspaceSlug } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) notFound();

  const base = `/${tenantSlug}/${workspaceSlug}`;
  const taskBase = `${base}/tasks`;
  const chatBase = `${base}/d/chat`;

  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.workspaceId, access.workspace.id))
    .orderBy(desc(tasks.createdAt));

  return (
    <div className="min-h-full overflow-y-auto bg-background">
      <PageHeading
        eyebrow="Travail"
        title="Tâches"
        description="Transformez une demande en travail structuré, traçable et soumis aux permissions du workspace."
      />
      <main className="mx-auto max-w-6xl space-y-8 px-5 py-6 md:px-8">
        {canAtLeast(access.role, "member") ? (
          <section>
            <h2 className="text-base font-medium">Créer une tâche</h2>
            <TaskTemplateGrid
              workspaceId={access.workspace.id}
              permissions={normalizePermissions(access.workspace.permissions)}
              runImmediately={false}
              taskBase={taskBase}
              chatBase={chatBase}
            />
          </section>
        ) : null}

        <section>
          <h2 className="text-base font-medium">Historique</h2>
          {rows.length ? (
            <ul className="mt-3 flex flex-col divide-y rounded-xl border">
              {rows.map((task) => (
                <li
                  key={task.id}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <Link
                    href={`${taskBase}/${task.id}`}
                    className="min-w-0 space-y-0.5"
                  >
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {TASK_TEMPLATES[task.kind].label} · {formatDateTime(task.createdAt)}
                    </p>
                  </Link>
                  <TaskStatusBadge status={task.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aucune tâche créée.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
