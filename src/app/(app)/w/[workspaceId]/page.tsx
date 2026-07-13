import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { approvals, chatSessions, files, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/workspace";
import { formatDate, formatDateTime } from "@/lib/format";
import { TASK_STATUS_LABELS, type TaskStatus } from "@/lib/task-templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2,
  Circle,
  FolderOpen,
  ListTodo,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";

function taskStatusBadgeProps(status: TaskStatus): {
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
} {
  switch (status) {
    case "done":
      return {
        variant: "outline",
        className:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-400",
      };
    case "failed":
      return { variant: "destructive" };
    case "waiting_approval":
      return {
        variant: "outline",
        className:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400",
      };
    case "running":
      return { variant: "secondary" };
    default:
      return { variant: "outline" };
  }
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const workspace = await getWorkspaceForUser(workspaceId, user.id);
  if (!workspace) notFound();

  const [
    [runningTasks],
    [pendingApprovals],
    [conversationsCount],
    [filesCount],
    [totalTasks],
    recentTasks,
    recentConversations,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.status, "running"))),
    db
      .select({ value: count() })
      .from(approvals)
      .where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.status, "pending"))),
    db.select({ value: count() }).from(chatSessions).where(eq(chatSessions.workspaceId, workspaceId)),
    db.select({ value: count() }).from(files).where(eq(files.workspaceId, workspaceId)),
    db.select({ value: count() }).from(tasks).where(eq(tasks.workspaceId, workspaceId)),
    db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, workspaceId))
      .orderBy(desc(tasks.createdAt))
      .limit(5),
    db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.workspaceId, workspaceId))
      .orderBy(desc(chatSessions.createdAt))
      .limit(5),
  ]);

  const base = `/w/${workspaceId}`;
  const checklist = [
    {
      label: "Démarrez une conversation avec votre assistant",
      done: (conversationsCount?.value ?? 0) > 0,
      href: `${base}/chat`,
    },
    {
      label: "Ajoutez un premier fichier",
      done: (filesCount?.value ?? 0) > 0,
      href: `${base}/files`,
    },
    {
      label: "Créez une première tâche",
      done: (totalTasks?.value ?? 0) > 0,
      href: `${base}/tasks`,
    },
  ];
  const showChecklist = checklist.some((item) => !item.done);

  const kpis = [
    { label: "Tâches en cours", value: runningTasks?.value ?? 0, href: `${base}/tasks`, icon: ListTodo },
    { label: "Validations en attente", value: pendingApprovals?.value ?? 0, href: `${base}/approvals`, icon: ShieldCheck },
    { label: "Conversations", value: conversationsCount?.value ?? 0, href: `${base}/chat`, icon: MessageSquare },
    { label: "Fichiers", value: filesCount?.value ?? 0, href: `${base}/files`, icon: FolderOpen },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 lg:px-8">
      <h1 className="text-xl font-semibold md:text-2xl">Bonjour, {user.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{workspace.name}</p>

      {showChecklist && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Pour bien démarrer</CardTitle>
            <CardDescription>Quelques étapes pour tirer parti de votre assistant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {checklist.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex min-h-11 items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {item.done ? (
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                ) : (
                  <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.label}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Link
            key={kpi.label}
            href={kpi.href}
            className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between gap-2">
                  <CardDescription>{kpi.label}</CardDescription>
                  <kpi.icon className="size-4 text-muted-foreground" aria-hidden />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{kpi.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tâches récentes</CardTitle>
          </CardHeader>
          <CardContent>
            {recentTasks.length === 0 ? (
              <div className="space-y-3 py-2 text-center">
                <p className="text-sm text-muted-foreground">
                  Aucune tâche pour l&apos;instant. Créez une tâche pour déléguer une action à votre assistant.
                </p>
                <Button asChild size="sm" className="h-11">
                  <Link href={`${base}/tasks`}>Créer une tâche</Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {recentTasks.map((task) => {
                  const badge = taskStatusBadgeProps(task.status);
                  return (
                    <li key={task.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="truncate">{task.title}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge variant={badge.variant} className={badge.className}>
                          {TASK_STATUS_LABELS[task.status]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(task.createdAt)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversations récentes</CardTitle>
          </CardHeader>
          <CardContent>
            {recentConversations.length === 0 ? (
              <div className="space-y-3 py-2 text-center">
                <p className="text-sm text-muted-foreground">
                  Aucune conversation pour l&apos;instant. Lancez une discussion avec votre assistant.
                </p>
                <Button asChild size="sm" className="h-11">
                  <Link href={`${base}/chat`}>Démarrer une conversation</Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {recentConversations.map((session) => (
                  <li key={session.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="truncate">{session.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(session.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
