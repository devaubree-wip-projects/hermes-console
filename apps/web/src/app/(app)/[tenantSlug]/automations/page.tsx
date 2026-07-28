import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2Icon,
  Clock3Icon,
  WorkflowIcon,
  XCircleIcon,
} from "lucide-react";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { canAtLeast, getTenantAccessBySlug } from "@/lib/workspace";
import {
  AutomationRowControls,
  CreateAutomationForm,
  RunAutomationButton,
} from "@/components/work/automation-controls";
import { Badge } from "@/components/ui/badge";
import { WorkLiveRefresh } from "@/components/work/work-live-refresh";
import {
  listWorkspaceAutomationRuns,
  listWorkspaceAutomations,
} from "@/modules/work/infrastructure/work-service";

export default async function AutomationsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) notFound();
  const [rows, history, readyAgents] = await Promise.all([
    listWorkspaceAutomations(access.workspace.id),
    listWorkspaceAutomationRuns(access.workspace.id),
    db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(eq(agents.workspaceId, access.workspace.id)),
  ]);
  const apiBase = `/api/${tenantSlug}`;
  const taskBase = `/${tenantSlug}/tasks`;
  return (
    <div className="min-h-full overflow-y-auto bg-background">
      <WorkLiveRefresh endpoint={`${apiBase}/work-stream`} />
      <header className="border-b px-5 py-5 md:px-8">
        <div className="w-full">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Travail
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            Automatisations
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Chaque déclenchement crée une tâche visible et un run auditable.
          </p>
        </div>
      </header>
      <main className="w-full space-y-6 px-5 py-6 md:px-8">
        {access.role === "owner" ? (
          <CreateAutomationForm
            endpoint={`${apiBase}/automations`}
            agents={readyAgents}
          />
        ) : null}
        {rows.length ? (
          <ul className="divide-y rounded-xl border bg-card">
            {rows.map((automation) => (
              <li
                key={automation.id}
                className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 gap-3">
                  <WorkflowIcon className="mt-0.5 size-5 text-muted-foreground" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-medium">{automation.name}</h3>
                      <Badge variant="outline">
                        {automation.status === "active"
                          ? "Active"
                          : automation.status}
                      </Badge>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock3Icon className="size-3.5" />
                      {automation.lastTriggeredAt
                        ? `Dernier run ${formatDateTime(automation.lastTriggeredAt)}`
                        : "Jamais exécutée"}{" "}
                      · déclencheur {automation.triggerType}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {access.role === "owner" ? (
                    <RunAutomationButton
                      endpoint={`${apiBase}/automations/${automation.id}/run`}
                      taskBase={taskBase}
                    />
                  ) : null}
                  {canAtLeast(access.role, "member") ? (
                    <AutomationRowControls
                      endpoint={`${apiBase}/automations/${automation.id}`}
                      status={automation.status}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed px-6 py-14 text-center">
            <h3 className="text-sm font-medium">Aucune automatisation</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Commencez par un déclencheur manuel, puis ajoutez cron ou webhook
              via l’API.
            </p>
          </div>
        )}
        {history.length ? (
          <section>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">
                Historique des déclenchements
              </h3>
              <span className="text-xs text-muted-foreground">
                {history.length} entrée{history.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="mt-3 divide-y rounded-xl border bg-card">
              {history.slice(0, 50).map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {entry.status === "succeeded" ? (
                      <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" />
                    ) : entry.status === "failed" ? (
                      <XCircleIcon className="size-4 shrink-0 text-destructive" />
                    ) : (
                      <Clock3Icon className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm">
                        {rows.find((row) => row.id === entry.automationId)
                          ?.name ?? "Automatisation"}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {entry.triggerType} · {formatDateTime(entry.startedAt)}
                      </span>
                    </span>
                  </span>
                  {entry.workItemId ? (
                    <Link
                      href={`${taskBase}?task=${encodeURIComponent(entry.workItemId)}`}
                      className="shrink-0 text-xs font-medium underline underline-offset-4"
                    >
                      Voir la tâche
                    </Link>
                  ) : (
                    <Badge variant="outline">{entry.status}</Badge>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
