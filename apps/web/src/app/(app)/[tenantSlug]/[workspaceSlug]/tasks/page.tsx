import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BotIcon, CalendarClockIcon, CircleDotIcon } from "lucide-react";
import { db } from "@/db";
import { agents, projects } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { canAtLeast, getWorkspaceAccessBySlugs } from "@/lib/workspace";
import { CreateWorkItemForm } from "@/components/work/create-work-item-form";
import { Button } from "@/components/ui/button";
import { WorkListToolbar } from "@/components/work/work-list-toolbar";
import { WorkBoard } from "@/components/work/work-board";
import { WorkLiveRefresh } from "@/components/work/work-live-refresh";
import { WorkItemStatusBadge } from "@/components/work/work-status-badge";
import { listWorkspaceAgentTeams, listWorkspaceSavedViews, listWorkspaceWorkItems, listWorkspaceWorkLabels } from "@/modules/work/infrastructure/work-service";

export default async function TasksPage({ params, searchParams }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }>; searchParams: Promise<{ q?: string; status?: string; priority?: string; project?: string; agent?: string; label?: string; creator?: string; due?: string; view?: string; page?: string }> }) {
  const { tenantSlug, workspaceSlug } = await params;
  const filters = await searchParams;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) notFound();
  const workspaceBase = `/${tenantSlug}/${workspaceSlug}`;
  const apiBase = `/api/${tenantSlug}/${workspaceSlug}`;
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  const pageSize = 50;
  const [rows, workspaceAgents, teams, workspaceProjects, labels, savedViews] = await Promise.all([
    listWorkspaceWorkItems({ workspaceId: access.workspace.id, query: filters.q, status: (["backlog", "todo", "in_progress", "blocked", "review", "done", "cancelled"].includes(filters.status ?? "") ? filters.status : null) as Parameters<typeof listWorkspaceWorkItems>[0]["status"], priority: (["none", "low", "medium", "high", "urgent"].includes(filters.priority ?? "") ? filters.priority : null) as Parameters<typeof listWorkspaceWorkItems>[0]["priority"], projectId: filters.project, assigneeAgentId: filters.agent, labelId: filters.label, creatorUserId: filters.creator === "me" ? user.id : null, due: (["overdue", "today", "week", "none"].includes(filters.due ?? "") ? filters.due : null) as Parameters<typeof listWorkspaceWorkItems>[0]["due"], limit: pageSize + 1, offset: (page - 1) * pageSize }),
    db.select({ id: agents.id, name: agents.name, runtimeState: agents.runtimeState })
      .from(agents).where(eq(agents.workspaceId, access.workspace.id)),
    listWorkspaceAgentTeams(access.workspace.id),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.workspaceId, access.workspace.id)),
    listWorkspaceWorkLabels(access.workspace.id),
    listWorkspaceSavedViews(access.workspace.id, user.id),
  ]);
  const hasNextPage = rows.length > pageSize;
  const visibleRows = rows.slice(0, pageSize);
  function pageHref(nextPage: number) {
    const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    if (nextPage <= 1) query.delete("page"); else query.set("page", String(nextPage));
    return `${workspaceBase}/tasks${query.size ? `?${query}` : ""}`;
  }

  return (
    <div className="min-h-full overflow-y-auto bg-background">
      <WorkLiveRefresh endpoint={`${apiBase}/work-stream`} />
      <header className="border-b px-5 py-5 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Travail</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Tâches</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Demandes durables, plans Hermes et livrables, indépendamment des sessions ouvertes dans le navigateur.</p>
          </div>
          <div className="text-sm text-muted-foreground">{visibleRows.length} tâche{visibleRows.length === 1 ? "" : "s"} sur cette page</div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-5 py-6 md:px-8">
        {canAtLeast(access.role, "member") ? <CreateWorkItemForm apiBase={apiBase} taskBase={`${workspaceBase}/tasks`} agents={workspaceAgents.map((agent) => ({ id: agent.id, name: agent.name, ready: agent.runtimeState === "ready" }))} teams={teams.map((team) => ({ id: team.id, name: team.name }))} projects={workspaceProjects} /> : null}
        <WorkListToolbar apiBase={apiBase} projects={workspaceProjects} agents={workspaceAgents} labels={labels} savedViews={savedViews} />
        {visibleRows.length && filters.view === "board" ? (
          <WorkBoard apiBase={apiBase} taskBase={`${workspaceBase}/tasks`} canEdit={canAtLeast(access.role, "member")} items={visibleRows.map(({ item, assigneeAgentName, activeRunCount }) => ({ id: item.id, key: item.key, title: item.title, status: item.status, assigneeName: assigneeAgentName, activeRunCount }))} />
        ) : visibleRows.length ? (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="hidden grid-cols-[minmax(0,1fr)_9rem_11rem_8rem] gap-4 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
              <span>Tâche</span><span>État</span><span>Assignation</span><span>Activité</span>
            </div>
            <ul className="divide-y">
              {visibleRows.map(({ item, assigneeAgentName, activeRunCount }) => (
                <li key={item.id}>
                  <Link href={`${workspaceBase}/tasks/${item.id}`} className="grid gap-3 px-4 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(0,1fr)_9rem_11rem_8rem] md:items-center md:gap-4">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{item.key}</span>{activeRunCount > 0 ? <CircleDotIcon className="size-3.5 animate-pulse text-blue-500 motion-reduce:animate-none" aria-label="Run actif" /> : null}</span>
                      <span className="mt-1 block truncate text-sm font-medium">{item.title}</span>
                    </span>
                    <span><WorkItemStatusBadge status={item.status} /></span>
                    <span className="flex items-center gap-2 truncate text-sm text-muted-foreground">{assigneeAgentName ? <><BotIcon className="size-4" />{assigneeAgentName}</> : "Non assignée"}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarClockIcon className="size-3.5" />{formatDateTime(item.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed px-6 py-14 text-center">
            <h3 className="text-sm font-medium">Le backlog est vide</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Créez une première tâche et assignez-la à un agent prêt. L’Edge l’exécutera même si vous quittez cette page.</p>
          </div>
        )}
        {page > 1 || hasNextPage ? <nav aria-label="Pagination des tâches" className="flex items-center justify-between gap-3"><Button asChild variant="outline" size="sm" className={page <= 1 ? "pointer-events-none invisible" : ""}><Link href={pageHref(page - 1)}>Page précédente</Link></Button><span className="text-xs text-muted-foreground">Page {page}</span><Button asChild variant="outline" size="sm" className={!hasNextPage ? "pointer-events-none invisible" : ""}><Link href={pageHref(page + 1)}>Page suivante</Link></Button></nav> : null}
      </main>
    </div>
  );
}
