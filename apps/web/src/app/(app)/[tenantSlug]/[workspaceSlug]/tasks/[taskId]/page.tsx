import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangleIcon, ArrowLeftIcon, BotIcon, CalendarClockIcon, CheckCircle2Icon, CircleIcon, CircleSlash2Icon, Clock3Icon, ExternalLinkIcon, FolderKanbanIcon, GitBranchIcon, LinkIcon, MessageSquareTextIcon, PaperclipIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { canAtLeast, getWorkspaceAccessBySlugs } from "@/lib/workspace";
import { WorkLiveRefresh } from "@/components/work/work-live-refresh";
import { WorkRunActions } from "@/components/work/work-run-actions";
import { PromotePlanStepButton, WorkCommentComposer } from "@/components/work/work-collaboration";
import { WorkItemStatusBadge, WorkRunStatusBadge } from "@/components/work/work-status-badge";
import { getWorkTimeline, getWorkspaceWorkItem } from "@/modules/work/infrastructure/work-service";
import { workRunTerminal } from "@/modules/work/domain/work";

export default async function TaskDetailPage({ params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string; taskId: string }> }) {
  const { tenantSlug, workspaceSlug, taskId } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) notFound();
  const [detail, timeline] = await Promise.all([
    getWorkspaceWorkItem(access.workspace.id, taskId).catch(() => null),
    getWorkTimeline(access.workspace.id, taskId).catch(() => []),
  ]);
  if (!detail) notFound();
  const { item, runs, activeRun, steps, comments, interventions, planRevision, project, assignee, dependencies, resources, labels } = detail;
  const workspaceBase = `/${tenantSlug}/${workspaceSlug}`;
  const apiBase = `/api/${tenantSlug}/${workspaceSlug}`;
  const currentRun = activeRun;
  const completedSteps = steps.filter((step) => step.status === "completed").length;
  const runIsActive = Boolean(currentRun && !workRunTerminal(currentRun.status));

  return (
    <div className="min-h-full overflow-y-auto bg-background">
      <WorkLiveRefresh endpoint={`${apiBase}/work-stream?workItemId=${item.id}`} />
      <header className="border-b px-5 py-5 md:px-8">
        <div className="mx-auto max-w-6xl">
          <Link href={`${workspaceBase}/tasks`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-4" />Tâches</Link>
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{item.key}</span><WorkItemStatusBadge status={item.status} />{item.priority !== "none" ? <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{item.priority}</span> : null}</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">{item.title}</h2>
              {labels.length ? <ul aria-label="Labels" className="mt-2 flex flex-wrap gap-1.5">{labels.map((label) => <li key={label.id} className="rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ borderColor: label.color, color: label.color }}>{label.name}</li>)}</ul> : null}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>Créée {formatDateTime(item.createdAt)} · mise à jour {formatDateTime(item.updatedAt)}</span>{assignee ? <span className="inline-flex items-center gap-1"><BotIcon className="size-3" />{assignee.name}</span> : null}{project ? <Link href={`${workspaceBase}/projects/${project.id}`} className="inline-flex items-center gap-1 hover:text-foreground"><FolderKanbanIcon className="size-3" />{project.name}</Link> : null}{item.dueAt ? <span className="inline-flex items-center gap-1"><CalendarClockIcon className="size-3" />Échéance {formatDateTime(item.dueAt)}</span> : null}</div>
            </div>
            {canAtLeast(access.role, "member") ? <WorkRunActions apiBase={apiBase} workItemId={item.id} runId={currentRun?.id} active={runIsActive} canRun={Boolean(item.assigneeAgentId)} /> : null}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-8">
          <section>
            <h3 className="text-sm font-semibold">Demande</h3>
            <p className="mt-3 max-w-[72ch] whitespace-pre-wrap text-sm leading-6 text-foreground/90">{item.description || "Aucun contexte ajouté."}</p>
          </section>

          {dependencies.length || resources.length ? <section className="grid gap-5 sm:grid-cols-2">
            {dependencies.length ? <div><h3 className="flex items-center gap-2 text-sm font-semibold"><LinkIcon className="size-4" />Dépendances</h3><ul className="mt-3 space-y-2">{dependencies.map((dependency) => <li key={`${dependency.direction}-${dependency.id}`}><Link href={`${workspaceBase}/tasks/${dependency.id}`} className="text-sm underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground"><span className="font-mono text-xs text-muted-foreground">{dependency.key}</span> · {dependency.title}</Link><span className="ml-2 text-[11px] text-muted-foreground">{dependency.direction === "depends_on" ? "bloque cette tâche" : "dépend de cette tâche"}</span></li>)}</ul></div> : null}
            {resources.length ? <div><h3 className="flex items-center gap-2 text-sm font-semibold"><PaperclipIcon className="size-4" />Ressources</h3><ul className="mt-3 space-y-2">{resources.map((resource) => <li key={resource.id} className="text-sm">{resource.uri.startsWith("https://") ? <a href={resource.uri} target="_blank" rel="noreferrer" className="underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground">{resource.name}</a> : <span>{resource.name}</span>}<span className="ml-2 font-mono text-[11px] text-muted-foreground">{resource.kind} · {resource.uri}</span></li>)}</ul></div> : null}
          </section> : null}

          <section>
            <div className="flex items-baseline justify-between gap-4"><h3 className="text-sm font-semibold">Activité</h3><span className="text-xs text-muted-foreground">{timeline.length} événement{timeline.length === 1 ? "" : "s"}</span></div>
            {timeline.length ? <ol className="mt-3 border-l pl-5">
              {timeline.slice(-30).reverse().map((entry, index) => {
                const label = entry.kind === "comment" ? "Commentaire" : entry.kind === "intervention" ? "Intervention" : String(entry.data.type).replaceAll(".", " ");
                const content = entry.kind === "comment" ? String(entry.data.content ?? "") : entry.kind === "intervention" ? String(entry.data.prompt ?? "") : null;
                return <li key={`${entry.kind}-${entry.data.id}-${index}`} className="relative pb-5 last:pb-0"><span className="absolute -left-[1.43rem] top-1 size-2 rounded-full bg-muted-foreground ring-4 ring-background" /><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium capitalize">{label}</span><span className="text-[11px] text-muted-foreground">{formatDateTime(entry.at)}</span></div>{content ? <p className="mt-1 max-w-[70ch] whitespace-pre-wrap text-sm text-muted-foreground">{content}</p> : null}</li>;
              })}
            </ol> : <p className="mt-3 text-sm text-muted-foreground">L’activité apparaîtra au démarrage du premier run.</p>}
            {canAtLeast(access.role, "member") ? <div className="mt-5"><WorkCommentComposer endpoint={`${apiBase}/work-items/${item.id}/comments`} /></div> : null}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Plan de l’agent</h3>{steps.length ? <span className="font-mono text-xs text-muted-foreground">{completedSteps}/{steps.length}</span> : null}</div>
            {planRevision?.diagnostics.includes("multiple_in_progress_steps") ? <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-300"><AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />Hermes a publié plusieurs étapes actives. Le plan reste visible, mais cette exécution mérite une vérification.</p> : null}
            {steps.length ? <ol className="mt-4 space-y-3">{steps.map((step) => <li key={step.id} className="flex items-start gap-2.5 text-sm">{step.status === "completed" ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : step.status === "cancelled" ? <CircleSlash2Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : step.status === "in_progress" ? <Clock3Icon className="mt-0.5 size-4 shrink-0 animate-pulse text-blue-600 motion-reduce:animate-none" /> : <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}<span className={`min-w-0 flex-1 ${step.status === "completed" || step.status === "cancelled" ? "text-muted-foreground line-through" : ""}`}>{step.content}</span>{step.promotedWorkItemId ? <Link href={`${workspaceBase}/tasks/${step.promotedWorkItemId}`} className="shrink-0 text-xs text-muted-foreground underline underline-offset-3">Sous-tâche</Link> : canAtLeast(access.role, "member") && currentRun ? <PromotePlanStepButton endpoint={`${apiBase}/work-runs/${currentRun.id}/plan-steps/${step.id}/promote`} taskBase={`${workspaceBase}/tasks`} /> : null}</li>)}</ol> : <p className="mt-3 text-sm leading-6 text-muted-foreground">{runIsActive ? "Plan en cours de construction. Hermes publiera ici sa checklist todo." : runs.length ? "Aucun plan structuré n’a été publié pour ce run." : "Le plan apparaîtra lorsqu’un agent commencera la tâche."}</p>}
          </section>

          {runs.some((run) => run.parentRunId) ? <section className="rounded-xl border bg-card p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><GitBranchIcon className="size-4" />Délégations Hermes</h3><ul className="mt-3 space-y-3">{runs.filter((run) => run.parentRunId).map((run) => <li key={run.id} className="flex items-center justify-between gap-3 border-t pt-3 first:border-0 first:pt-0"><span className="min-w-0"><span className="block truncate text-sm">{run.prompt || "Sous-agent Hermes"}</span><span className="font-mono text-[11px] text-muted-foreground">{run.agentName} @{run.agentSlug} · session enfant · {run.attempt}</span></span><span className="flex shrink-0 items-center gap-2"><WorkRunStatusBadge status={run.status} />{run.hermesSessionId ? <Link href={`${workspaceBase}/d/chat/c/${encodeURIComponent(run.hermesSessionId)}?agentId=${encodeURIComponent(run.agentId)}`} aria-label="Ouvrir la session enfant" className="text-muted-foreground hover:text-foreground"><ExternalLinkIcon className="size-3.5" /></Link> : null}</span></li>)}</ul></section> : null}

          <section className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold">Run</h3>
            {currentRun ? <div className="mt-3 space-y-3 text-sm"><div className="flex items-center justify-between gap-3"><WorkRunStatusBadge status={currentRun.status} /><span className="font-mono text-xs text-muted-foreground">tentative {currentRun.attempt}</span></div><div className="flex items-center gap-2 text-muted-foreground"><BotIcon className="size-4" /><span>{currentRun.hermesProfileName}</span></div>{currentRun.startedAt ? <p className="text-xs text-muted-foreground">Démarré {formatDateTime(currentRun.startedAt)}</p> : <p className="text-xs text-muted-foreground">En attente d’un Edge disponible.</p>}{currentRun.hermesSessionId ? <Link href={`${workspaceBase}/d/chat/c/${encodeURIComponent(currentRun.hermesSessionId)}?agentId=${encodeURIComponent(currentRun.agentId)}`} className="inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-4">Ouvrir dans Sessions<ExternalLinkIcon className="size-3" /></Link> : null}{currentRun.resultSummary ? <div className="border-t pt-3"><p className="text-xs font-medium text-muted-foreground">Livrable</p><p className="mt-1 whitespace-pre-wrap leading-6">{currentRun.resultSummary}</p></div> : null}</div> : <p className="mt-3 text-sm text-muted-foreground">Aucun run.</p>}
          </section>

          {interventions.some((entry) => entry.status === "pending") ? <Link href={`${workspaceBase}/approvals`} className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-medium text-amber-800 dark:text-amber-300"><MessageSquareTextIcon className="size-4" />Une intervention requiert votre attention</Link> : null}
          {comments.length && !currentRun?.resultSummary ? <section className="rounded-xl border p-4"><h3 className="text-sm font-semibold">Dernier livrable</h3><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{comments.at(-1)?.content}</p></section> : null}
        </aside>
      </main>
    </div>
  );
}
