import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { normalizePermissions } from "@/lib/permissions";
import { TASK_TEMPLATES } from "@/lib/task-templates";
import { getWorkspaceForUser } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { TaskTemplateGrid } from "@/components/tasks/task-template-grid";

export default async function TasksPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const workspace = await getWorkspaceForUser(workspaceId, user.id);
  if (!workspace) notFound();

  const workspaceTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.workspaceId, workspaceId))
    .orderBy(desc(tasks.createdAt));

  const permissions = normalizePermissions(workspace.permissions);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 lg:px-8">
      <h1 className="text-xl font-semibold md:text-2xl">Tâches</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Transformez vos demandes en tâches structurées confiées à l’agent.
      </p>

      <section id="templates" className="mt-6 scroll-mt-4">
        <h2 className="text-base font-medium">Créer une tâche</h2>
        <TaskTemplateGrid workspaceId={workspaceId} permissions={permissions} />
      </section>

      <section className="mt-8">
        <h2 className="text-base font-medium">Tâches</h2>
        {workspaceTasks.length === 0 ? (
          <div className="mt-3 flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
            <p className="text-sm text-muted-foreground">
              Transformez le chat en vrai travail : lancez une tâche structurée (audit,
              rapport, contenu…).
            </p>
            <Button asChild className="h-11">
              <a href="#templates">Créer une tâche</a>
            </Button>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col divide-y rounded-xl border">
            {workspaceTasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/w/${workspaceId}/tasks/${task.id}`}
                  className="flex min-h-11 flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{task.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {TASK_TEMPLATES[task.kind].label} · {formatDateTime(task.createdAt)}
                    </span>
                  </span>
                  <TaskStatusBadge status={task.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
