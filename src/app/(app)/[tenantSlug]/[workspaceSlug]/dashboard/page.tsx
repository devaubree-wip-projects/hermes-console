import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, desc, eq } from "drizzle-orm";
import { Activity, ArrowRight, Bot, CheckCircle2, CircleDollarSign, MessageSquare, WifiOff } from "lucide-react";
import { db } from "@/db";
import { agents, approvals, files, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getHermesDashboardData } from "@/lib/hermes/server";
import { getWorkspaceAccessBySlugs } from "@/lib/workspace";
import { PageHeading } from "@/components/product/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function number(value: unknown) {
  return typeof value === "number" ? value : 0;
}

export default async function DashboardPage({ params }: { params: Promise<{ tenantSlug: string; workspaceSlug: string }> }) {
  const { tenantSlug, workspaceSlug } = await params;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) notFound();
  const base = `/${tenantSlug}/${workspaceSlug}`;

  const workspaceAgents = await db
    .select()
    .from(agents)
    .where(eq(agents.workspaceId, access.workspace.id))
    .orderBy(desc(agents.updatedAt));
  const primaryAgent = workspaceAgents[0];
  const runtime = primaryAgent ? await getHermesDashboardData(primaryAgent.hermesProfileName) : null;
  const [[taskCount], [pendingCount], [fileCount]] = await Promise.all([
    db.select({ value: count() }).from(tasks).where(eq(tasks.workspaceId, access.workspace.id)),
    db.select({ value: count() }).from(approvals).where(and(eq(approvals.workspaceId, access.workspace.id), eq(approvals.status, "pending"))),
    db.select({ value: count() }).from(files).where(eq(files.workspaceId, access.workspace.id)),
  ]);
  const totals = runtime?.usage?.totals ?? {};
  const sessions = runtime?.sessions?.sessions ?? [];

  const kpis = [
    { label: "Agents", value: workspaceAgents.length, icon: Bot, hint: "profils Hermes" },
    { label: "Sessions", value: runtime?.sessions?.total ?? 0, icon: MessageSquare, hint: "conversations" },
    { label: "Tâches", value: taskCount?.value ?? 0, icon: Activity, hint: "travaux structurés" },
    { label: "À valider", value: pendingCount?.value ?? 0, icon: CheckCircle2, hint: "actions sensibles" },
  ];

  return (
    <div className="min-h-full overflow-y-auto bg-background">
      <PageHeading
        eyebrow={`${access.tenant.name} · ${access.workspace.name}`}
        title={`Bonjour ${user.name.split(" ")[0]}`}
        description="Voici ce que vos agents ont fait et ce qui réclame votre attention."
        actions={<Button asChild><Link href={`${base}/d/chat`}>Ouvrir la messagerie <ArrowRight /></Link></Button>}
      />
      <main className="mx-auto max-w-7xl space-y-6 px-5 py-6 md:px-8">
        {!runtime?.online ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm">
            <WifiOff className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div><p className="font-medium">Runtime Hermes hors ligne</p><p className="text-muted-foreground">L’interface reste disponible. Lancez <code className="font-mono">hermes serve</code> pour les sessions et métriques temps réel.</p></div>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(({ label, value, icon: Icon, hint }) => (
            <Card key={label} className="gap-3 py-5 shadow-none">
              <CardHeader className="flex-row items-center justify-between px-5"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle><Icon className="size-4 text-muted-foreground" /></CardHeader>
              <CardContent className="px-5"><p className="text-3xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card className="shadow-none">
            <CardHeader className="flex-row items-center justify-between"><CardTitle>Activité récente</CardTitle>{primaryAgent ? <Badge variant="outline">{primaryAgent.name}</Badge> : null}</CardHeader>
            <CardContent>
              {sessions.length ? <ul className="divide-y">{sessions.slice(0, 6).map((session, index) => {
                return <li key={`${session.id ?? session.session_id ?? index}`} className="flex items-center gap-3 py-3"><span className="size-2 rounded-full bg-emerald-500" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{session.title || "Conversation sans titre"}</p><p className="text-xs text-muted-foreground">{session.message_count ?? 0} messages</p></div><Button asChild variant="ghost" size="sm"><Link href={`${base}/d/chat`}>Ouvrir</Link></Button></li>;
              })}</ul> : <p className="py-10 text-center text-sm text-muted-foreground">Aucune conversation pour le moment.</p>}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader><CardTitle>30 derniers jours</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Tokens</span><strong className="tabular-nums">{(number(totals.total_input) + number(totals.total_output)).toLocaleString("fr-FR")}</strong></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Appels API</span><strong className="tabular-nums">{number(totals.total_api_calls)}</strong></div>
              <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm text-muted-foreground"><CircleDollarSign className="size-4" />Coût estimé</span><strong className="tabular-nums">${number(totals.total_estimated_cost).toFixed(2)}</strong></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Fichiers disponibles</span><strong className="tabular-nums">{fileCount?.value ?? 0}</strong></div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
