import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CircleDotIcon, PaperclipIcon, WorkflowIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getTenantAccessBySlug } from "@/lib/workspace";
import { Badge } from "@/components/ui/badge";
import { WorkItemStatusBadge } from "@/components/work/work-status-badge";
import { getWorkspaceProject } from "@/modules/work/infrastructure/work-service";

export default async function ProjectDetailPage({ params }: { params: Promise<{ tenantSlug: string; projectId: string }> }) {
  const { tenantSlug, projectId } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) notFound();
  const detail = await getWorkspaceProject(access.workspace.id, projectId).catch(() => null);
  if (!detail) notFound();
  const { project, tasks, automations, resources, progress } = detail;
  const base = `/${tenantSlug}`;
  return <div className="min-h-full overflow-y-auto bg-background">
    <header className="border-b px-5 py-5 md:px-8"><div className="w-full"><Link href={`${base}/projects`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-4" />Projets</Link><div className="mt-4 flex flex-wrap items-start justify-between gap-4"><div><span className="font-mono text-xs text-muted-foreground">{project.key}</span><h2 className="mt-1 text-2xl font-semibold tracking-tight">{project.name}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{project.description || "Aucun contexte projet."}</p></div><Badge variant="outline">{project.status}</Badge></div></div></header>
    <main className="grid w-full gap-6 px-5 py-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section><div className="flex items-center justify-between gap-4"><h3 className="text-sm font-semibold">Tâches</h3><span className="font-mono text-xs text-muted-foreground">{progress.completed}/{progress.total} terminées</span></div>{tasks.length ? <ul className="mt-3 divide-y rounded-xl border bg-card">{tasks.map(({ item, assigneeAgentName, activeRunCount }) => <li key={item.id}><Link href={`${base}/tasks?task=${encodeURIComponent(item.id)}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40"><span className="min-w-0"><span className="font-mono text-[11px] text-muted-foreground">{item.key}</span><span className="block truncate text-sm font-medium">{item.title}</span><span className="text-xs text-muted-foreground">{assigneeAgentName ?? "Non assignée"}</span></span><span className="flex items-center gap-2"><WorkItemStatusBadge status={item.status} />{activeRunCount ? <CircleDotIcon className="size-3 text-blue-500" /> : null}</span></Link></li>)}</ul> : <p className="mt-3 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aucune tâche dans ce projet.</p>}</section>
      <aside className="space-y-4"><section className="rounded-xl border bg-card p-4"><h3 className="text-sm font-semibold">Progression</h3><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground" style={{ width: `${progress.total ? Math.round(progress.completed / progress.total * 100) : 0}%` }} /></div><p className="mt-2 text-xs text-muted-foreground">{progress.total ? `${progress.completed} tâche${progress.completed === 1 ? "" : "s"} sur ${progress.total}` : "Aucune tâche à mesurer"}</p></section>{resources.length ? <section className="rounded-xl border bg-card p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><PaperclipIcon className="size-4" />Ressources</h3><ul className="mt-3 space-y-2">{resources.map((resource) => <li key={resource.id} className="text-sm">{resource.uri.startsWith("https://") ? <a href={resource.uri} target="_blank" rel="noreferrer" className="underline underline-offset-4">{resource.name}</a> : resource.name}<span className="ml-2 font-mono text-[11px] text-muted-foreground">{resource.kind}</span></li>)}</ul></section> : null}<section className="rounded-xl border bg-card p-4"><h3 className="text-sm font-semibold">Automatisations</h3>{automations.length ? <ul className="mt-3 space-y-2">{automations.map((automation) => <li key={automation.id} className="flex items-center gap-2 text-sm"><WorkflowIcon className="size-4 text-muted-foreground" /><span className="truncate">{automation.name}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Aucune automatisation liée.</p>}</section></aside>
    </main>
  </div>;
}
