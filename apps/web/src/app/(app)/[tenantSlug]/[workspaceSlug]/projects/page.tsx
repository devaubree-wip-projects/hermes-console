import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderKanbanIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canAtLeast, getWorkspaceAccessBySlugs } from "@/lib/workspace";
import { CreateProjectForm } from "@/components/work/create-project-form";
import { Badge } from "@/components/ui/badge";
import { listWorkspaceProjects } from "@/modules/work/infrastructure/work-service";

export default async function ProjectsPage({ params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> }) {
  const { tenantSlug, workspaceSlug } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) notFound();
  const projects = await listWorkspaceProjects(access.workspace.id);
  const base = `/${tenantSlug}/${workspaceSlug}/projects`;
  return <div className="min-h-full overflow-y-auto bg-background"><header className="border-b px-5 py-5 md:px-8"><div className="mx-auto max-w-6xl"><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Travail</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Projets</h2><p className="mt-1 text-sm text-muted-foreground">Regroupez les tâches, ressources et automatisations autour d’un résultat partagé.</p></div></header><main className="mx-auto max-w-6xl space-y-6 px-5 py-6 md:px-8">{canAtLeast(access.role, "member") ? <CreateProjectForm endpoint={`/api/${tenantSlug}/${workspaceSlug}/projects`} /> : null}{projects.length ? <ul className="grid gap-4 md:grid-cols-2">{projects.map((project) => <li key={project.id}><Link href={`${base}/${project.id}`} className="block rounded-xl border bg-card p-5 transition-colors hover:border-foreground/20"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 gap-3"><FolderKanbanIcon className="mt-0.5 size-5 text-muted-foreground" /><div><span className="font-mono text-xs text-muted-foreground">{project.key}</span><h3 className="mt-1 font-medium">{project.name}</h3></div></div><Badge variant="outline">{project.status}</Badge></div>{project.description ? <p className="mt-4 text-sm leading-6 text-muted-foreground">{project.description}</p> : null}</Link></li>)}</ul> : <div className="rounded-xl border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">Aucun projet. Les tâches peuvent rester indépendantes.</div>}</main></div>;
}
