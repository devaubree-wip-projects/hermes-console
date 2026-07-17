import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ListTodoIcon } from "lucide-react";
import { db } from "@/db";
import { agents, projects, tenantMemberships, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { canAtLeast, getTenantAccessBySlug } from "@/lib/workspace";
import { CreateWorkItemForm } from "@/components/work/create-work-item-form";
import { TaskDetailContent } from "@/components/work/task-detail-content";
import { TaskDetailLoading, TaskDetailSheet } from "@/components/work/task-detail-sheet";
import { WorkBoard } from "@/components/work/work-board";
import { WorkListToolbar } from "@/components/work/work-list-toolbar";
import {
  listWorkspaceAgentTeams,
  listWorkspaceSavedViews,
  listWorkspaceWorkItems,
  listWorkspaceWorkLabels,
} from "@/modules/work/infrastructure/work-service";

type RouteParams = {
  tenantSlug: string;
  };

type TaskFilters = {
  q?: string;
  status?: string;
  priority?: string;
  project?: string;
  agent?: string;
  label?: string;
  creator?: string;
  due?: string;
  view?: string;
  page?: string;
  task?: string;
};

type TasksPageProps = {
  params: Promise<RouteParams>;
  searchParams: Promise<TaskFilters>;
};

function TasksBoardLoading() {
  return (
    <div role="status" aria-label="Chargement des tâches" className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-14 shrink-0 items-center border-b px-4">
        <div className="h-4 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4">
        {[0, 1, 2, 3].map((column) => (
          <div key={column} className="h-full w-[280px] shrink-0 animate-pulse rounded-xl bg-muted/60 motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}

async function TasksBoardContent({ params, searchParams }: TasksPageProps) {
  const [{ tenantSlug }, filters] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) notFound();
  const workspaceBase = `/${tenantSlug}`;
  const apiBase = `/api/${tenantSlug}`;
  const pageSize = 200;
  const [rows, workspaceAgents, teams, workspaceProjects, labels, savedViews, members] = await Promise.all([
    listWorkspaceWorkItems({
      workspaceId: access.workspace.id,
      query: filters.q,
      status: (["backlog", "todo", "in_progress", "blocked", "review", "done", "cancelled"].includes(filters.status ?? "") ? filters.status : null) as Parameters<typeof listWorkspaceWorkItems>[0]["status"],
      priority: (["none", "low", "medium", "high", "urgent"].includes(filters.priority ?? "") ? filters.priority : null) as Parameters<typeof listWorkspaceWorkItems>[0]["priority"],
      projectId: filters.project,
      assigneeAgentId: filters.agent,
      labelId: filters.label,
      creatorUserId: filters.creator === "me" ? user.id : null,
      due: (["overdue", "today", "week", "none"].includes(filters.due ?? "") ? filters.due : null) as Parameters<typeof listWorkspaceWorkItems>[0]["due"],
      limit: pageSize,
      offset: 0,
    }),
    db.select({ id: agents.id, name: agents.name, runtimeState: agents.runtimeState })
      .from(agents)
      .where(eq(agents.workspaceId, access.workspace.id)),
    listWorkspaceAgentTeams(access.workspace.id),
    db.select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.workspaceId, access.workspace.id)),
    listWorkspaceWorkLabels(access.workspace.id),
    listWorkspaceSavedViews(access.workspace.id, user.id),
    db.select({ id: users.id, name: users.name })
      .from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .where(eq(tenantMemberships.tenantId, access.tenant.id)),
  ]);
  const visibleRows = rows.slice(0, pageSize);

  return (
    <>
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <ListTodoIcon className="size-4 text-muted-foreground" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-medium">Tâches</h1>
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{visibleRows.length}</span>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">Travail durable planifié et exécuté par Hermes</p>
          </div>
        </div>
        {canAtLeast(access.role, "member") ? (
          <CreateWorkItemForm
            apiBase={apiBase}
            taskBase={`${workspaceBase}/tasks`}
            agents={workspaceAgents.map((agent) => ({ id: agent.id, name: agent.name, ready: agent.runtimeState === "ready" }))}
            teams={teams.map((team) => ({ id: team.id, name: team.name }))}
            members={members}
            projects={workspaceProjects}
          />
        ) : null}
      </header>
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <WorkListToolbar apiBase={apiBase} projects={workspaceProjects} agents={workspaceAgents} labels={labels} savedViews={savedViews} />
        <WorkBoard
          apiBase={apiBase}
          taskBase={`${workspaceBase}/tasks`}
          canEdit={canAtLeast(access.role, "member")}
          items={visibleRows.map(({ item, projectName, assigneeAgentName, activeRunCount }) => ({
            id: item.id,
            key: item.key,
            title: item.title,
            description: item.description,
            status: item.status,
            priority: item.priority,
            projectName,
            assigneeName: assigneeAgentName,
            activeRunCount,
            dueLabel: item.dueAt ? formatDate(item.dueAt) : null,
            overdue: Boolean(item.dueAt && item.dueAt < new Date() && item.status !== "done" && item.status !== "cancelled"),
            updatedLabel: formatDateTime(item.updatedAt),
            detailSeed: {
              item,
              project: item.projectId && projectName ? { id: item.projectId, name: projectName } : null,
              assignee: assigneeAgentName && (item.assigneeAgentId || item.assigneeTeamId)
                ? { id: item.assigneeAgentId ?? item.assigneeTeamId!, name: assigneeAgentName }
                : null,
            },
          }))}
        />
      </main>
    </>
  );
}

async function SelectedTaskSheet({ params, searchParams }: TasksPageProps) {
  const [{ tenantSlug }, filters] = await Promise.all([params, searchParams]);
  if (!filters.task) return null;
  return (
    <TaskDetailSheet>
      <Suspense fallback={<TaskDetailLoading />}>
        <TaskDetailContent tenantSlug={tenantSlug} taskId={filters.task} embedded />
      </Suspense>
    </TaskDetailSheet>
  );
}

export default function TasksPage({ params, searchParams }: TasksPageProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <Suspense fallback={<TasksBoardLoading />}>
        <TasksBoardContent params={params} searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <SelectedTaskSheet params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
