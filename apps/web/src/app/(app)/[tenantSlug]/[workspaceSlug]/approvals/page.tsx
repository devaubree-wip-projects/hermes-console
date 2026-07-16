import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldAlertIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { canApprove, getWorkspaceAccessBySlugs } from "@/lib/workspace";
import { Badge } from "@/components/ui/badge";
import { InterventionActions } from "@/components/work/intervention-actions";
import { WorkLiveRefresh } from "@/components/work/work-live-refresh";
import { listWorkspaceInterventions } from "@/modules/work/infrastructure/work-service";

const TYPE_LABELS: Record<string, string> = {
  approval: "Approbation",
  clarification: "Clarification",
  sudo: "Élévation sudo",
  secret: "Secret",
  launch_review: "Revue avant lancement",
  deliverable_review: "Revue du livrable",
};

export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; workspaceSlug: string }>;
}) {
  const { tenantSlug, workspaceSlug } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(
    tenantSlug,
    workspaceSlug,
    user.id,
  );
  if (!access) notFound();
  const rows = await listWorkspaceInterventions(access.workspace.id);
  const pending = rows.filter((row) => row.status === "pending");
  const base = `/${tenantSlug}/${workspaceSlug}`;
  return (
    <div className="min-h-full overflow-y-auto bg-background">
      <WorkLiveRefresh endpoint={`/api/${tenantSlug}/${workspaceSlug}/work-stream`} />
      <header className="border-b px-5 py-5 md:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Travail
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            Validations
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Les demandes Hermes qui nécessitent une décision humaine, avec leur
            tâche et leur run d’origine.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-8 px-5 py-6 md:px-8">
        {pending.length ? (
          <section className="space-y-4">
            {pending.map((entry) => (
              <article key={entry.id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <ShieldAlertIcon className="mt-0.5 size-5 text-amber-600" />
                    <div>
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      >
                        {TYPE_LABELS[entry.type]}
                      </Badge>
                      <p className="mt-3 max-w-[70ch] whitespace-pre-wrap text-sm leading-6">
                        {entry.prompt}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`${base}/tasks/${entry.workItemId}`}
                    className="text-xs text-muted-foreground underline underline-offset-4"
                  >
                    Ouvrir la tâche
                  </Link>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Demandée {formatDateTime(entry.createdAt)}
                </p>
                {canApprove(access.role) ? (
                  <div className="mt-4 border-t pt-4">
                    <InterventionActions
                      endpoint={`/api/${tenantSlug}/${workspaceSlug}/interventions/${entry.id}`}
                      type={entry.type}
                    />
                  </div>
                ) : null}
              </article>
            ))}
          </section>
        ) : (
          <div className="rounded-xl border border-dashed px-6 py-14 text-center">
            <h3 className="text-sm font-medium">Aucune décision en attente</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Hermes poursuivra les runs qui n’exigent pas d’intervention.
            </p>
          </div>
        )}
        {rows.some((row) => row.status !== "pending") ? (
          <section>
            <h3 className="mb-3 text-sm font-semibold">Historique</h3>
            <ul className="divide-y rounded-xl border bg-card">
              {rows
                .filter((row) => row.status !== "pending")
                .map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm">
                        {TYPE_LABELS[entry.type]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(entry.createdAt)}
                      </span>
                    </span>
                    <Badge variant="outline">{entry.status}</Badge>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
