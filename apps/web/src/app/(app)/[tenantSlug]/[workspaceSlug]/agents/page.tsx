import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, Bot, Plus, Radio, UsersRound } from "lucide-react";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getWorkspaceAccessBySlugs } from "@/lib/workspace";
import { PageHeading } from "@/components/product/page-heading";
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

export default async function AgentsPage({
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
  const base = `/${tenantSlug}/${workspaceSlug}`;
  const [rows, teams] = await Promise.all([
    db
      .select()
      .from(agents)
      .where(eq(agents.workspaceId, access.workspace.id))
      .orderBy(desc(agents.updatedAt)),
    listWorkspaceAgentTeams(access.workspace.id),
  ]);
  return (
    <div className="min-h-full overflow-y-auto bg-background">
      <PageHeading
        eyebrow="Agents & conversations"
        title="Votre équipe d’agents"
        description="Chaque agent correspond à un profil Hermes et possède son propre historique de sessions."
        actions={
          access.role === "owner" ? (
            <Button asChild>
              <Link href={`${base}/agents/new`}>
                <Plus />
                Créer un agent
              </Link>
            </Button>
          ) : null
        }
      />
      <main className="mx-auto max-w-6xl space-y-8 px-5 py-6 md:px-8">
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Équipes d’agents</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Une tâche assignée à une équipe est exécutée par son agent lead.
              </p>
            </div>
            {access.role === "owner" ? (
              <CreateAgentTeamForm
                endpoint={`/api/${tenantSlug}/${workspaceSlug}/agent-teams`}
                agents={rows.map((agent) => ({
                  id: agent.id,
                  name: agent.name,
                }))}
              />
            ) : null}
          </div>
          {teams.length ? (
            <ul className="divide-y rounded-xl border bg-card">
              {teams.map((team) => (
                <li
                  key={team.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <span className="flex items-center gap-3">
                    <UsersRound className="size-4 text-muted-foreground" />
                    <span>
                      <span className="block text-sm font-medium">
                        {team.name}{" "}
                        <span className="font-mono text-xs font-normal text-muted-foreground">
                          @{team.slug}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Lead {team.leadAgentName ?? "inconnu"} ·{" "}
                        {team.memberCount} membre
                        {team.memberCount === 1 ? "" : "s"} · concurrence{" "}
                        {team.concurrencyLimit}
                        {team.delegationPolicy.autoDelegatePlanSteps === true
                          ? " · plan auto-délégué"
                          : ""}
                      </span>
                    </span>
                  </span>
                  <Badge variant="outline">Équipe prête</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Aucune équipe. Les agents restent assignables individuellement.
            </p>
          )}
        </section>
        <section>
          <h2 className="mb-4 text-sm font-semibold">Agents</h2>
          {rows.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((agent) => (
                <Card
                  key={agent.id}
                  className="shadow-none transition-colors hover:border-foreground/20"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-foreground text-background">
                        <Bot className="size-5" />
                      </span>
                      <Badge
                        variant={
                          agent.runtimeState === "ready"
                            ? "outline"
                            : "secondary"
                        }
                      >
                        <Radio className="size-3" />
                        {agent.runtimeState === "ready"
                          ? "Prêt"
                          : "Configuration requise"}
                      </Badge>
                    </div>
                    <CardTitle className="mt-3">{agent.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-3 min-h-12 text-sm text-muted-foreground">
                      {agent.description || "Aucune mission définie."}
                    </p>
                    <p className="mt-4 truncate font-mono text-xs text-muted-foreground">
                      profil: {agent.hermesProfileName}
                    </p>
                    {agent.runtimeError ? (
                      <p className="mt-2 line-clamp-2 text-xs text-amber-700 dark:text-amber-400">
                        {agent.runtimeError}
                      </p>
                    ) : null}
                  </CardContent>
                  <CardFooter>
                    <Button asChild variant="outline" className="w-full">
                      <Link href={`${base}/d/chat?agentId=${agent.id}`}>
                        Ouvrir une conversation <ArrowRight />
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-12 text-center">
              <Bot className="mx-auto size-8 text-muted-foreground" />
              <h2 className="mt-4 font-medium">Aucun agent</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Créez le premier profil Hermes de ce workspace.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
