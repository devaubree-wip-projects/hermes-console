import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { chatSessions, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { TASK_TEMPLATES } from "@/lib/task-templates";
import { getWorkspaceAccessBySlugs } from "@/lib/workspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskRunButton } from "@/components/tasks/task-run-button";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{
    tenantSlug: string;
    workspaceSlug: string;
    taskId: string;
  }>;
}) {
  const { tenantSlug, workspaceSlug, taskId } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) notFound();

  const baseWorkspace = `/${tenantSlug}/${workspaceSlug}`;
  const chatBase = `${baseWorkspace}/d/chat`;
  const tasksBase = `${baseWorkspace}/tasks`;
  const approvalsBase = `${baseWorkspace}/approvals`;

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, access.workspace.id)))
    .limit(1);
  if (!task) notFound();

  const [session] = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.taskId, task.id))
    .orderBy(desc(chatSessions.createdAt))
    .limit(1);

  const template = TASK_TEMPLATES[task.kind];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 lg:px-8">
      <Link
        href={tasksBase}
        className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Tâches
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold md:text-2xl">{task.title}</h1>
        <TaskStatusBadge status={task.status} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {template.label} · créée le {formatDateTime(task.createdAt)} · mise à jour le{" "}
        {formatDateTime(task.updatedAt)}
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Demande</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{task.input}</p>
        </CardContent>
      </Card>

      {task.status === "waiting_approval" && (
        <Alert variant="warning" className="mt-6">
          <AlertTitle>En attente de validation</AlertTitle>
          <AlertDescription>
            Cette tâche nécessite une validation avant de pouvoir être exécutée.{" "}
            <Link href={approvalsBase}>Voir les validations</Link>
          </AlertDescription>
        </Alert>
      )}

      {task.status === "draft" && (
        <div className="mt-6">
          <TaskRunButton taskId={task.id} chatBase={chatBase} />
        </div>
      )}

      {task.status === "running" && (
        <p className="mt-6 text-sm text-muted-foreground">
          La tâche est en cours d&apos;exécution.{" "}
          {session && (
            <Link href={`${chatBase}/${session.id}`} className="text-foreground underline underline-offset-3">
              Voir la conversation
            </Link>
          )}
        </p>
      )}

      {task.status === "done" && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Livrable</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="whitespace-pre-wrap text-sm">{task.output}</p>
            {session && (
              <Button asChild variant="secondary" className="h-11 w-fit">
                <Link href={`${chatBase}/${session.id}`}>Voir la conversation</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {task.status === "failed" && (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>La tâche a échoué</AlertTitle>
          <AlertDescription>
            {task.output ?? "Une erreur est survenue pendant l’exécution."}
            {session && (
              <>
                {" "}
                <Link href={`${chatBase}/${session.id}`}>Voir la conversation</Link>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
