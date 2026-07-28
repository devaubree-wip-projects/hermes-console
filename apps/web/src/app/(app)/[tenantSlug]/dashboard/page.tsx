import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, count, eq } from "drizzle-orm";
import { Activity, ArrowRight, Bot, CheckCircle2, CircleDollarSign, FileText, WifiOff } from "lucide-react";
import { db } from "@/db";
import { agents, files, workInterventions, workItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getHermesDashboardData } from "@/lib/hermes/server";
import { getTenantAccessBySlug } from "@/lib/workspace";
import { PageHeading } from "@/components/product/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboardSessionHref } from "./dashboard-links";

function number(value: unknown) {
  return typeof value === "number" ? value : 0;
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ agentId?: string | string[] }>;
}) {
  const { tenantSlug } = await params;
  const query = await searchParams;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) notFound();
  const base = `/${tenantSlug}`;

  const workspaceAgents = await db
    .select()
    .from(agents)
    .where(eq(agents.workspaceId, access.workspace.id))
    .orderBy(asc(agents.createdAt));
  const requestedAgentId = Array.isArray(query.agentId)
    ? query.agentId[0]
    : query.agentId;
  const primaryAgent = workspaceAgents.find((agent) => agent.id === requestedAgentId)
    ?? workspaceAgents[0];
  const runtime = primaryAgent
    ? await getHermesDashboardData(primaryAgent.hermesProfileName, { agentId: primaryAgent.id })
    : null;
  const [[taskCount], [pendingCount], [fileCount]] = await Promise.all([
    db.select({ value: count() }).from(workItems).where(eq(workItems.workspaceId, access.workspace.id)),
    db.select({ value: count() }).from(workInterventions).where(and(eq(workInterventions.workspaceId, access.workspace.id), eq(workInterventions.status, "pending"))),
    db.select({ value: count() }).from(files).where(eq(files.workspaceId, access.workspace.id)),
  ]);
  const totals = runtime?.usage?.totals ?? {};
  const sessions = runtime?.sessions?.sessions ?? [];

  const kpis = [
    { label: "Agents", value: workspaceAgents.length, icon: Bot, hint: "profils Hermes" },
    { label: "Tâches", value: taskCount?.value ?? 0, icon: Activity, hint: "travaux structurés" },
    { label: "À valider", value: pendingCount?.value ?? 0, icon: CheckCircle2, hint: "actions sensibles" },
    { label: "Fichiers", value: fileCount?.value ?? 0, icon: FileText, hint: "ressources disponibles" },
  ];

  return (
    <div className="min-h-full overflow-y-auto bg-background">
      <PageHeading
        eyebrow={access.tenant.name}
        title={`Bonjour ${user.name.split(" ")[0]}`}
        description="Voici les totaux de votre organisation et l’activité du runtime observé."
        actions={<Button asChild><Link href={primaryAgent
          ? dashboardSessionHref({ tenantSlug, agentId: primaryAgent.id, session: {} })
          : `${base}/d/chat`
        }>Ouvrir la messagerie <ArrowRight /></Link></Button>}
      />
      <main className="mx-auto max-w-7xl space-y-6 px-5 py-6 md:px-8">
        {primaryAgent && !runtime?.online ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm">
            <WifiOff className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="flex flex-1 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Runtime Hermes hors ligne · {primaryAgent.name}</p>
                <p className="text-muted-foreground">L’interface reste disponible. Vérifiez l’installation associée pour rétablir les sessions et métriques.</p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href={`${base}/installations`}>Gérer les installations</Link>
              </Button>
            </div>
          </div>
        ) : null}

        <section aria-labelledby="organization-totals-title" className="space-y-3">
          <div>
            <h2 id="organization-totals-title" className="text-sm font-semibold">Totaux de l’organisation</h2>
            <p className="text-xs text-muted-foreground">Données cumulées à l’échelle de cette organisation, tous agents confondus.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map(({ label, value, icon: Icon, hint }) => (
              <Card key={label} className="gap-3 py-5 shadow-none">
                <CardHeader className="flex-row items-center justify-between px-5"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle><Icon className="size-4 text-muted-foreground" /></CardHeader>
                <CardContent className="px-5"><p className="text-3xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="runtime-overview-title" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="runtime-overview-title" className="text-sm font-semibold">
              Aperçu runtime · {primaryAgent?.name ?? "Aucun agent"}
            </h2>
            {primaryAgent ? <Badge variant="outline">Cet agent uniquement</Badge> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Sessions et consommation du profil Hermes observé, sans agrégation des autres agents.
          </p>
          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <Card className="shadow-none">
              <CardHeader><CardTitle>Activité récente</CardTitle></CardHeader>
              <CardContent>
                {sessions.length && primaryAgent ? <ul className="divide-y">{sessions.slice(0, 6).map((session, index) => {
                  const title = session.title || "Conversation sans titre";
                  return <li key={`${session.id ?? session.session_id ?? index}`} className="flex items-center gap-3 py-3"><span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{session.message_count ?? 0} messages</p></div><Button asChild variant="ghost" size="sm"><Link href={dashboardSessionHref({ tenantSlug, agentId: primaryAgent.id, session })} aria-label={`Ouvrir ${title} avec ${primaryAgent.name}`}>Ouvrir</Link></Button></li>;
                })}</ul> : <p className="py-10 text-center text-sm text-muted-foreground">Aucune conversation pour le moment.</p>}
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader><CardTitle>30 derniers jours</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Tokens</span><strong className="tabular-nums">{(number(totals.total_input) + number(totals.total_output)).toLocaleString("fr-FR")}</strong></div>
                <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Appels API</span><strong className="tabular-nums">{number(totals.total_api_calls)}</strong></div>
                <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm text-muted-foreground"><CircleDollarSign className="size-4" />Coût estimé</span><strong className="tabular-nums">${number(totals.total_estimated_cost).toFixed(2)}</strong></div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
