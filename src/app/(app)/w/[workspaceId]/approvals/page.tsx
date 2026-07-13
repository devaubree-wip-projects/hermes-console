import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { approvals, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { PERMISSION_LABELS, type PermissionKey } from "@/lib/permissions";
import { getWorkspaceForUser } from "@/lib/workspace";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApprovalActions } from "@/components/approvals/approval-actions";

const ACTION_LABELS: Record<string, string> = {
  run_task: "Exécuter la tâche",
};

export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const workspace = await getWorkspaceForUser(workspaceId, user.id);
  if (!workspace) notFound();

  const rows = await db
    .select({ approval: approvals, task: tasks })
    .from(approvals)
    .leftJoin(tasks, eq(approvals.taskId, tasks.id))
    .where(eq(approvals.workspaceId, workspaceId))
    .orderBy(desc(approvals.createdAt));

  const pending = rows.filter((row) => row.approval.status === "pending");
  const decided = rows.filter((row) => row.approval.status !== "pending");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 lg:px-8">
      <h1 className="text-xl font-semibold md:text-2xl">Validations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Les actions sensibles proposées par l’agent attendent votre feu vert ici.
      </p>

      <section className="mt-6">
        <h2 className="text-base font-medium">En attente</h2>
        {pending.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed p-6">
            <p className="text-sm text-muted-foreground">
              Aucune action en attente — les actions sensibles de l’agent apparaîtront ici
              pour validation.
            </p>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {pending.map(({ approval, task }) => {
              const payload = (approval.payload ?? {}) as { permission?: PermissionKey };
              const permissionLabel = payload.permission
                ? PERMISSION_LABELS[payload.permission]?.label
                : null;
              return (
                <Card key={approval.id}>
                  <CardHeader>
                    <CardTitle>
                      {ACTION_LABELS[approval.actionType] ?? approval.actionType}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1 text-sm">
                      {task && (
                        <Link
                          href={`/w/${workspaceId}/tasks/${task.id}`}
                          className="font-medium underline underline-offset-3"
                        >
                          {task.title}
                        </Link>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {permissionLabel && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          >
                            {permissionLabel}
                          </Badge>
                        )}
                        <span>{formatDateTime(approval.createdAt)}</span>
                      </div>
                    </div>
                    <ApprovalActions
                      approvalId={approval.id}
                      taskId={approval.taskId}
                      workspaceId={workspaceId}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-medium">Historique</h2>
        {decided.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Aucune décision pour le moment.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y rounded-xl border">
            {decided.map(({ approval, task }) => (
              <li
                key={approval.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {task?.title ?? ACTION_LABELS[approval.actionType] ?? approval.actionType}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {approval.decidedAt ? formatDateTime(approval.decidedAt) : ""}
                  </span>
                </span>
                <Badge
                  variant={approval.status === "approved" ? "outline" : "destructive"}
                  className={
                    approval.status === "approved"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : undefined
                  }
                >
                  {approval.status === "approved" ? "Approuvée" : "Refusée"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
