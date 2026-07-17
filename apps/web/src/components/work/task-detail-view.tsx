"use client";

import Link from "next/link";
import { AlertTriangleIcon, ArrowLeftIcon, BotIcon, CalendarClockIcon, CheckCircle2Icon, CircleIcon, CircleSlash2Icon, Clock3Icon, ExternalLinkIcon, FolderKanbanIcon, GitBranchIcon, LinkIcon, MessageSquareTextIcon, PaperclipIcon } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { WorkLiveRefresh } from "@/components/work/work-live-refresh";
import { WorkRunActions } from "@/components/work/work-run-actions";
import { PromotePlanStepButton, WorkCommentComposer } from "@/components/work/work-collaboration";
import { WorkItemStatusBadge, WorkRunStatusBadge } from "@/components/work/work-status-badge";
import { workRunTerminal } from "@/modules/work/domain/work";
import type { getWorkTimeline, getWorkspaceWorkItem } from "@/modules/work/infrastructure/work-service";

export type TaskDetailData = Awaited<ReturnType<typeof getWorkspaceWorkItem>>;
export type TaskTimeline = Awaited<ReturnType<typeof getWorkTimeline>>;
export type TaskDetailSeed = {
  item: TaskDetailData["item"];
  project: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
};

export function taskDetailFromSeed(seed: TaskDetailSeed): TaskDetailData {
  return {
    ...seed,
    runs: [],
    runPagination: { limit: 200, offset: 0, hasMore: false },
    activeRun: null,
    steps: [],
    comments: [],
    interventions: [],
    planRevision: null,
    dependencies: [],
    resources: [],
    labels: [],
  } as unknown as TaskDetailData;
}

export function TaskDetailView({ workspaceBase, detail, timeline, canEdit, embedded = false, hydrating = false, onSelectTask, onRefresh }: {
  workspaceBase: string;
  detail: TaskDetailData;
  timeline: TaskTimeline | null;
  canEdit: boolean;
  embedded?: boolean;
  hydrating?: boolean;
  onSelectTask?: (taskId: string) => void;
  onRefresh?: () => void;
}) {
  const { item, runs, activeRun, steps, comments, interventions, planRevision, project, assignee, dependencies, resources, labels } = detail;
  const apiBase = `/api${workspaceBase}`;
  const currentRun = activeRun;
  const completedSteps = steps.filter((step) => step.status === "completed").length;
  const runIsActive = Boolean(currentRun && !workRunTerminal(currentRun.status));
  const taskHref = (id: string) => embedded
    ? `${workspaceBase}/tasks?task=${encodeURIComponent(id)}`
    : `${workspaceBase}/tasks/${id}`;

  return (
    <div className={embedded ? "flex h-full min-h-0 flex-col bg-background" : "min-h-full overflow-y-auto bg-background"}>
      <WorkLiveRefresh endpoint={`${apiBase}/work-stream?workItemId=${item.id}`} onChanged={onRefresh ? (change) => { if (change.source !== "snapshot") onRefresh(); } : undefined} />
      <header className={`shrink-0 border-b border-border/80 bg-background px-5 md:px-7 ${embedded ? "py-4 pr-14 md:pr-14" : "py-5"}`}>
        <div className="w-full">
          {embedded ? null : <Link href={`${workspaceBase}/tasks`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-4" />Tâches</Link>}
          <div className={`${embedded ? "" : "mt-4 "}flex flex-col gap-4 md:flex-row md:items-start md:justify-between`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[11px] font-medium text-muted-foreground">{item.key}</span><WorkItemStatusBadge status={item.status} />{item.priority !== "none" ? <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{item.priority}</span> : null}</div>
              <h2 className={`${embedded ? "text-xl" : "text-2xl"} mt-2 max-w-[32ch] font-semibold leading-tight tracking-tight`}>{item.title}</h2>
              {labels.length ? <ul aria-label="Labels" className="mt-2 flex flex-wrap gap-1.5">{labels.map((label) => <li key={label.id} className="rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ borderColor: label.color, color: label.color }}>{label.name}</li>)}</ul> : null}
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground"><span>Créée {formatDateTime(item.createdAt)} · mise à jour {formatDateTime(item.updatedAt)}</span>{assignee ? <span className="inline-flex items-center gap-1.5"><BotIcon className="size-3" />{assignee.name}</span> : null}{project ? <Link href={`${workspaceBase}/projects/${project.id}`} className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"><FolderKanbanIcon className="size-3" />{project.name}</Link> : null}{item.dueAt ? <span className="inline-flex items-center gap-1.5"><CalendarClockIcon className="size-3" />Échéance {formatDateTime(item.dueAt)}</span> : null}</div>
            </div>
            {canEdit && !hydrating ? <WorkRunActions apiBase={apiBase} workItemId={item.id} runId={currentRun?.id} active={runIsActive} canRun={Boolean(item.assigneeAgentId)} onChanged={onRefresh} /> : hydrating && canEdit ? <div role="status" aria-label="Chargement des actions" className="h-9 w-28 animate-pulse rounded-md bg-muted motion-reduce:animate-none" /> : null}
          </div>
        </div>
      </header>

      <main className={`${embedded ? "min-h-0 flex-1 overflow-y-auto" : ""} grid w-full lg:grid-cols-[minmax(0,1fr)_21rem]`}>
        <div className="min-w-0 px-5 py-6 md:px-7 md:py-7">
          <section className="border-b border-border/70 pb-7">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Demande</h3>
            <p className="mt-3 max-w-[72ch] whitespace-pre-wrap text-sm leading-6 text-foreground/90">{item.description || "Aucun contexte ajouté."}</p>
          </section>

          {!hydrating && (dependencies.length || resources.length) ? <section className="grid gap-6 border-b border-border/70 py-7 sm:grid-cols-2">
            {dependencies.length ? <div><h3 className="flex items-center gap-2 text-sm font-semibold"><LinkIcon className="size-4" />Dépendances</h3><ul className="mt-3 space-y-2">{dependencies.map((dependency) => <li key={`${dependency.direction}-${dependency.id}`}><Link href={taskHref(dependency.id)} scroll={false} onClick={(event) => { if (onSelectTask) { event.preventDefault(); onSelectTask(dependency.id); } }} className="text-sm underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground"><span className="font-mono text-xs text-muted-foreground">{dependency.key}</span> · {dependency.title}</Link><span className="ml-2 text-[11px] text-muted-foreground">{dependency.direction === "depends_on" ? "bloque cette tâche" : "dépend de cette tâche"}</span></li>)}</ul></div> : null}
            {resources.length ? <div><h3 className="flex items-center gap-2 text-sm font-semibold"><PaperclipIcon className="size-4" />Ressources</h3><ul className="mt-3 space-y-2">{resources.map((resource) => <li key={resource.id} className="text-sm">{resource.uri.startsWith("https://") ? <a href={resource.uri} target="_blank" rel="noreferrer" className="underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground">{resource.name}</a> : <span>{resource.name}</span>}<span className="ml-2 font-mono text-[11px] text-muted-foreground">{resource.kind} · {resource.uri}</span></li>)}</ul></div> : null}
          </section> : null}

          <section className="pt-7">
            <div className="flex items-baseline justify-between gap-4"><h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Activité</h3>{timeline ? <span className="font-mono text-[11px] text-muted-foreground">{timeline.length} événement{timeline.length === 1 ? "" : "s"}</span> : null}</div>
            {timeline === null ? <div role="status" aria-label="Chargement de l’activité" className="mt-4 space-y-3"><div className="h-3 w-3/4 animate-pulse rounded bg-muted motion-reduce:animate-none" /><div className="h-3 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div> : timeline.length ? <ol className="mt-4 border-l border-border pl-5">
              {timeline.slice(-30).reverse().map((entry, index) => {
                const label = entry.kind === "comment" ? "Commentaire" : entry.kind === "intervention" ? "Intervention" : String(entry.data.type).replaceAll(".", " ");
                const content = entry.kind === "comment" ? String(entry.data.content ?? "") : entry.kind === "intervention" ? String(entry.data.prompt ?? "") : null;
                return <li key={`${entry.kind}-${entry.data.id}-${index}`} className="relative pb-5 last:pb-0"><span className="absolute -left-[1.43rem] top-1 size-2 rounded-full bg-muted-foreground ring-4 ring-background" /><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium capitalize">{label}</span><span className="text-[11px] text-muted-foreground">{formatDateTime(entry.at)}</span></div>{content ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{content}</p> : null}</li>;
              })}
            </ol> : <p className="mt-3 text-sm text-muted-foreground">L’activité apparaîtra au démarrage du premier run.</p>}
            {canEdit && !hydrating ? <div className="mt-6"><WorkCommentComposer endpoint={`${apiBase}/work-items/${item.id}/comments`} onChanged={onRefresh} /></div> : null}
          </section>
        </div>

        <aside className="divide-y divide-border/70 border-t border-border/80 bg-muted/25 px-5 lg:border-l lg:border-t-0">
          <section className="py-6">
            <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Plan de l’agent</h3>{steps.length ? <span className="rounded-md bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground ring-1 ring-border">{completedSteps}/{steps.length}</span> : null}</div>
            {planRevision?.diagnostics.includes("multiple_in_progress_steps") ? <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-300"><AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />Hermes a publié plusieurs étapes actives. Le plan reste visible, mais cette exécution mérite une vérification.</p> : null}
            {hydrating ? <div role="status" aria-label="Chargement du plan" className="mt-4 space-y-3"><div className="h-3 w-5/6 animate-pulse rounded bg-background motion-reduce:animate-none" /><div className="h-3 w-2/3 animate-pulse rounded bg-background motion-reduce:animate-none" /></div> : steps.length ? <ol className="mt-4 space-y-3">{steps.map((step) => <li key={step.id} className="flex items-start gap-2.5 text-sm">{step.status === "completed" ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : step.status === "cancelled" ? <CircleSlash2Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : step.status === "in_progress" ? <Clock3Icon className="mt-0.5 size-4 shrink-0 animate-pulse text-blue-600 motion-reduce:animate-none" /> : <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}<span className={`min-w-0 flex-1 ${step.status === "completed" || step.status === "cancelled" ? "text-muted-foreground line-through" : ""}`}>{step.content}</span>{step.promotedWorkItemId ? <Link href={taskHref(step.promotedWorkItemId)} scroll={false} onClick={(event) => { if (onSelectTask) { event.preventDefault(); onSelectTask(step.promotedWorkItemId!); } }} className="shrink-0 text-xs text-muted-foreground underline underline-offset-3">Sous-tâche</Link> : canEdit && currentRun ? <PromotePlanStepButton endpoint={`${apiBase}/work-runs/${currentRun.id}/plan-steps/${step.id}/promote`} taskBase={`${workspaceBase}/tasks`} openInSheet={embedded} onPromoted={onSelectTask} /> : null}</li>)}</ol> : <p className="mt-3 text-sm leading-6 text-muted-foreground">{runIsActive ? "Plan en cours de construction. Hermes publiera ici sa checklist todo." : runs.length ? "Aucun plan structuré n’a été publié pour ce run." : "Le plan apparaîtra lorsqu’un agent commencera la tâche."}</p>}
          </section>

          {runs.some((run) => run.parentRunId) ? <section className="py-6"><h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"><GitBranchIcon className="size-3.5" />Délégations Hermes</h3><ul className="mt-4 space-y-3">{runs.filter((run) => run.parentRunId).map((run) => <li key={run.id} className="flex items-center justify-between gap-3 border-t pt-3 first:border-0 first:pt-0"><span className="min-w-0"><span className="block truncate text-sm">{run.prompt || "Sous-agent Hermes"}</span><span className="font-mono text-[11px] text-muted-foreground">{run.agentName} @{run.agentSlug} · session enfant · {run.attempt}</span></span><span className="flex shrink-0 items-center gap-2"><WorkRunStatusBadge status={run.status} />{run.hermesSessionId ? <Link href={`${workspaceBase}/d/chat/c/${encodeURIComponent(run.hermesSessionId)}?agentId=${encodeURIComponent(run.agentId)}`} aria-label="Ouvrir la session enfant" className="text-muted-foreground hover:text-foreground"><ExternalLinkIcon className="size-3.5" /></Link> : null}</span></li>)}</ul></section> : null}

          <section className="py-6">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Run</h3>
            {hydrating ? <div role="status" aria-label="Chargement du run" className="mt-4 space-y-3"><div className="h-5 w-24 animate-pulse rounded bg-background motion-reduce:animate-none" /><div className="h-3 w-32 animate-pulse rounded bg-background motion-reduce:animate-none" /></div> : currentRun ? <div className="mt-3 space-y-3 text-sm"><div className="flex items-center justify-between gap-3"><WorkRunStatusBadge status={currentRun.status} /><span className="font-mono text-xs text-muted-foreground">tentative {currentRun.attempt}</span></div><div className="flex items-center gap-2 text-muted-foreground"><BotIcon className="size-4" /><span>{currentRun.hermesProfileName}</span></div>{currentRun.startedAt ? <p className="text-xs text-muted-foreground">Démarré {formatDateTime(currentRun.startedAt)}</p> : <p className="text-xs text-muted-foreground">En attente d’un Edge disponible.</p>}{currentRun.hermesSessionId ? <Link href={`${workspaceBase}/d/chat/c/${encodeURIComponent(currentRun.hermesSessionId)}?agentId=${encodeURIComponent(currentRun.agentId)}`} className="inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-4">Ouvrir dans Sessions<ExternalLinkIcon className="size-3" /></Link> : null}{currentRun.resultSummary ? <div className="border-t pt-3"><p className="text-xs font-medium text-muted-foreground">Livrable</p><p className="mt-1 whitespace-pre-wrap leading-6">{currentRun.resultSummary}</p></div> : null}</div> : <p className="mt-3 text-sm text-muted-foreground">Aucun run.</p>}
          </section>

          {interventions.some((entry) => entry.status === "pending") ? <div className="py-6"><Link href={`${workspaceBase}/approvals`} className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-medium text-amber-800 dark:text-amber-300"><MessageSquareTextIcon className="size-4" />Une intervention requiert votre attention</Link></div> : null}
          {comments.length && !currentRun?.resultSummary ? <section className="py-6"><h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Dernier livrable</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/80">{comments.at(-1)?.content}</p></section> : null}
        </aside>
      </main>
    </div>
  );
}
