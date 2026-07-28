import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, Bot, Trash2 } from "lucide-react";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { getTenantAccessBySlug } from "@/lib/workspace";
import { CreateAgentDialog } from "@/components/agents/create-agent-dialog";
import { EditAgentDialog } from "@/components/agents/edit-agent-dialog";
import { PageHeading } from "@/components/product/page-heading";
import { SectionTabs } from "@/components/product/section-tabs";
import { DeleteConfirmDialog } from "@/components/shared/delete-confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateAgentTeamForm } from "@/components/work/create-agent-team-form";
import { listWorkspaceAgentTeams } from "@/modules/work/infrastructure/work-service";

// Deterministic accent per agent/team so each monogram reads as unique.
const ACCENTS = [
  "bg-violet-500/12 text-violet-600 dark:text-violet-300",
  "bg-sky-500/12 text-sky-600 dark:text-sky-300",
  "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/12 text-rose-600 dark:text-rose-300",
  "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300",
  "bg-teal-500/12 text-teal-600 dark:text-teal-300",
  "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-300",
];

function accentFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ACCENTS[hash % ACCENTS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default async function AgentsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) notFound();
  const base = `/${tenantSlug}`;
  const [rows, teams] = await Promise.all([
    db
      .select()
      .from(agents)
      .where(eq(agents.workspaceId, access.workspace.id))
      .orderBy(desc(agents.updatedAt)),
    listWorkspaceAgentTeams(access.workspace.id),
  ]);
  const isOwner = access.role === "owner";

  const agentsContent = rows.length ? (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((agent) => {
        const ready = agent.runtimeState === "ready";
        return (
          <Card
            key={agent.id}
            className="group/agent shadow-none transition hover:ring-foreground/25"
          >
            <CardHeader>
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold",
                    accentFor(agent.id),
                  )}
                >
                  {initials(agent.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate">{agent.name}</CardTitle>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        ready ? "bg-emerald-500" : "bg-amber-500",
                      )}
                    />
                    {ready ? "Prêt" : "Configuration requise"}
                  </p>
                </div>
                {isOwner ? (
                  <div className="-mr-1 -mt-1 flex shrink-0 items-center">
                    <EditAgentDialog
                      endpoint={`/api/${tenantSlug}/agents/${agent.slug}`}
                      initialName={agent.name}
                      initialDescription={agent.description ?? ""}
                    />
                    <DeleteConfirmDialog
                      endpoint={`/api/${tenantSlug}/agents/${agent.slug}`}
                      title={`Supprimer « ${agent.name} » ?`}
                      description="L’agent est retiré de la Console avec ses sessions. Le profil Hermes sous-jacent reste sur le runtime. Cette action est irréversible."
                      successMessage="Agent supprimé."
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Supprimer l’agent"
                        >
                          <Trash2 />
                        </Button>
                      }
                    />
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                {agent.description || "Aucune mission définie."}
              </p>
              <p className="mt-3 truncate font-mono text-xs text-muted-foreground/80">
                {agent.hermesProfileName}
              </p>
              {agent.runtimeError ? (
                <p className="mt-2 line-clamp-2 text-xs text-amber-700 dark:text-amber-400">
                  {agent.runtimeError}
                </p>
              ) : null}
            </CardContent>
            <CardFooter>
              <Link
                href={`${base}/d/chat?agentId=${agent.id}`}
                className="flex w-full items-center justify-between text-sm font-medium"
              >
                Ouvrir une conversation
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover/agent:translate-x-0.5 group-hover/agent:text-foreground" />
              </Link>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  ) : (
    <div className="rounded-2xl border border-dashed p-12 text-center">
      <Bot className="mx-auto size-8 text-muted-foreground" />
      <h2 className="mt-4 font-medium">Aucun agent</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Créez le premier profil Hermes de cette organisation.
      </p>
    </div>
  );

  const teamsContent = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Une tâche assignée à une équipe est exécutée par son agent lead, qui
        planifie puis délègue les étapes aux membres.
      </p>
      {teams.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {teams.map((team) => (
            <li
              key={team.id}
              className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10"
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold",
                  accentFor(team.slug),
                )}
              >
                {initials(team.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {team.name}{" "}
                  <span className="font-mono text-xs font-normal text-muted-foreground">
                    @{team.slug}
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  Lead {team.leadAgentName ?? "inconnu"} · {team.memberCount}{" "}
                  membre{team.memberCount === 1 ? "" : "s"} · concurrence{" "}
                  {team.concurrencyLimit}
                  {team.delegationPolicy.autoDelegatePlanSteps === true
                    ? " · plan auto-délégué"
                    : ""}
                </p>
              </div>
              <Badge variant="success">Prête</Badge>
              {isOwner ? (
                <DeleteConfirmDialog
                  endpoint={`/api/${tenantSlug}/agent-teams/${team.id}`}
                  title={`Supprimer l’équipe « ${team.name} » ?`}
                  description="L’équipe est dissoute. Les agents membres et leurs conversations sont conservés ; les tâches assignées à l’équipe redeviennent non assignées."
                  successMessage="Équipe supprimée."
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Supprimer l’équipe"
                    >
                      <Trash2 />
                    </Button>
                  }
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aucune équipe. Les agents restent assignables individuellement.
        </p>
      )}
    </div>
  );

  return (
    <div className="min-h-full overflow-y-auto bg-background">
      <PageHeading
        eyebrow="Agents & conversations"
        title="Votre équipe d’agents"
        description="Chaque agent correspond à un profil Hermes et possède son propre historique de sessions."
      />
      <main className="container mx-auto px-5 py-6 md:px-8">
        <SectionTabs
          tabs={[
            {
              value: "agents",
              label: "Agents",
              count: rows.length,
              action: isOwner ? (
                <CreateAgentDialog endpoint={`/api/${tenantSlug}/agents`} />
              ) : null,
              content: agentsContent,
            },
            {
              value: "teams",
              label: "Équipes",
              count: teams.length,
              action: isOwner ? (
                <CreateAgentTeamForm
                  endpoint={`/api/${tenantSlug}/agent-teams`}
                  agents={rows.map((agent) => ({
                    id: agent.id,
                    name: agent.name,
                  }))}
                />
              ) : null,
              content: teamsContent,
            },
          ]}
        />
      </main>
    </div>
  );
}
