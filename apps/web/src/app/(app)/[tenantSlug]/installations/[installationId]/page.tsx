import { and, desc, eq } from "drizzle-orm";
import { ArrowLeftIcon, BotIcon, ClockIcon, GaugeIcon, NetworkIcon, ShieldCheckIcon, WalletIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InstallationActions } from "@/components/installations/installation-actions";
import { InstallationBackupActions, InstallationBudgetForm, InstallationCapacityPolicy, InstallationOperations, InstallationUpgradeActions, RotateRelayIdentity } from "@/components/installations/installation-control-panel";
import { PageHeading } from "@/components/product/page-heading";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/db";
import {
  agents,
  auditEvents,
  runtimeBackups,
  runtimeBudgets,
  runtimeCapabilities,
  runtimeIdentities,
  runtimeInstallations,
  runtimeOperations,
  runtimeUsageSamples,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canConfigureRuntime, getTenantAccessBySlug } from "@/lib/workspace";

const statusLabels = {
  pending_enrollment: "Enrôlement requis",
  checking: "Vérification",
  ready: "Prête",
  degraded: "Dégradée",
  offline: "Hors ligne",
  incompatible: "Incompatible",
  upgrading: "Mise à niveau",
  rollback_required: "Rollback requis",
  revoked: "Révoquée",
} as const;

function date(value: Date | null) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Jamais";
}

function bytes(value: number | null) {
  if (value === null) return "Indisponible";
  return new Intl.NumberFormat("fr-FR", { style: "unit", unit: "gigabyte", maximumFractionDigits: 1 }).format(value / 1_000_000_000);
}

function money(micros: number | null, currency = "EUR") {
  if (micros === null) return "Non défini";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(micros / 1_000_000);
}

export default async function InstallationDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; installationId: string }>;
}) {
  const { tenantSlug, installationId } = await params;
  const user = await requireUser();
  const access = await getTenantAccessBySlug(tenantSlug, user.id);
  if (!access) notFound();
  const [installation] = await db.select().from(runtimeInstallations).where(and(
    eq(runtimeInstallations.id, installationId),
    eq(runtimeInstallations.tenantId, access.tenant.id),
  )).limit(1);
  if (!installation) notFound();

  const [capability, workspaceAgents, usage, budget, operations, backups, identities, audit] = await Promise.all([
    db.select().from(runtimeCapabilities).where(eq(runtimeCapabilities.installationId, installation.id)).limit(1).then((rows) => rows[0] ?? null),
    db.select({ id: agents.id, name: agents.name, profileName: agents.hermesProfileName, installationId: agents.runtimeInstallationId, state: agents.runtimeState })
      .from(agents).where(eq(agents.workspaceId, access.workspace.id)).orderBy(agents.createdAt),
    db.select().from(runtimeUsageSamples).where(eq(runtimeUsageSamples.installationId, installation.id))
      .orderBy(desc(runtimeUsageSamples.sampledAt)).limit(1).then((rows) => rows[0] ?? null),
    db.select().from(runtimeBudgets).where(eq(runtimeBudgets.installationId, installation.id)).limit(1).then((rows) => rows[0] ?? null),
    db.select().from(runtimeOperations).where(eq(runtimeOperations.installationId, installation.id)).orderBy(desc(runtimeOperations.createdAt)).limit(20),
    db.select().from(runtimeBackups).where(eq(runtimeBackups.installationId, installation.id)).orderBy(desc(runtimeBackups.createdAt)).limit(20),
    db.select().from(runtimeIdentities).where(eq(runtimeIdentities.installationId, installation.id)).orderBy(desc(runtimeIdentities.createdAt)),
    db.select().from(auditEvents).where(and(
      eq(auditEvents.targetType, "runtime_installation"),
      eq(auditEvents.targetId, installation.id),
      eq(auditEvents.tenantId, access.tenant.id),
    )).orderBy(desc(auditEvents.createdAt)).limit(30),
  ]);
  const assignedAgents = workspaceAgents.filter((agent) => agent.installationId === installation.id);
  const endpoint = `/api/${tenantSlug}/installations/${installation.id}`;
  const canManage = canConfigureRuntime(access.role);

  return <div className="min-h-full overflow-y-auto bg-background" data-testid="installation-detail">
    <PageHeading
      actions={<Button asChild variant="outline"><Link href={`/${tenantSlug}/installations`}><ArrowLeftIcon />Toutes les installations</Link></Button>}
      description={`${installation.installationKey} · ${installation.gatewayUrl}`}
      eyebrow="Installation Hermes"
      title={installation.name}
    />
    <div className="mx-auto grid max-w-7xl gap-6 px-5 pb-10 md:px-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-2 text-2xl font-semibold tracking-tight">{installation.name}</h1>
          <Badge variant={installation.status === "ready" ? "outline" : "secondary"}>{statusLabels[installation.status]}</Badge>
          <Badge variant="secondary">{installation.origin.replaceAll("_", " ")}</Badge>
          <Badge variant="secondary">{installation.managementLevel}</Badge>
          <Badge variant="secondary">{installation.transport}</Badge>
        </div>
        {installation.statusDetail ? <Alert title="État du runtime" variant={installation.status === "ready" ? "success" : "warning"}>{installation.statusDetail}</Alert> : null}

        <Tabs defaultValue="overview">
          <TabsList className="max-w-full overflow-x-auto" variant="line">
            <TabsTrigger value="overview">Résumé</TabsTrigger>
            <TabsTrigger value="capacity">Capacité</TabsTrigger>
            <TabsTrigger value="costs">Coûts</TabsTrigger>
            <TabsTrigger value="operations">Opérations</TabsTrigger>
            <TabsTrigger value="backups">Sauvegardes</TabsTrigger>
            <TabsTrigger value="security">Sécurité</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent className="grid gap-4 pt-4 md:grid-cols-2" value="overview">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><NetworkIcon />Connectivité</CardTitle></CardHeader><CardContent className="grid gap-2 text-sm">
              <p><span className="text-muted-foreground">Dernière preuve :</span> {date(installation.lastSeenAt)}</p>
              <p><span className="text-muted-foreground">Protocole :</span> {installation.gatewayProtocolVersion ?? "Inconnu"}</p>
              <p><span className="text-muted-foreground">Hermes :</span> {installation.hermesVersion ?? "Inconnu"}</p>
              <p><span className="text-muted-foreground">Runtime :</span> {installation.detectedRuntime}</p>
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><BotIcon />Agents et profils</CardTitle></CardHeader><CardContent className="grid gap-2">
              {assignedAgents.length ? assignedAgents.map((agent) => <div className="flex items-center justify-between rounded-lg border p-2" key={agent.id}><span>{agent.name}</span><Badge variant="secondary">{agent.profileName}</Badge></div>) : <p className="text-sm text-muted-foreground">Aucun agent de cette organisation n’est associé.</p>}
            </CardContent></Card>
          </TabsContent>

          <TabsContent className="grid gap-4 pt-4 md:grid-cols-2" value="capacity">
            {usage ? <>
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><GaugeIcon />Calcul</CardTitle></CardHeader><CardContent className="grid gap-2"><p>CPU : {usage.cpuPercentBasisPoints === null ? "Indisponible" : `${usage.cpuPercentBasisPoints / 100}%`}</p><p>RAM : {bytes(usage.memoryUsedBytes)} / {bytes(usage.memoryTotalBytes)}</p><p>Disque : {bytes(usage.diskUsedBytes)} / {bytes(usage.diskTotalBytes)}</p></CardContent></Card>
              <Card><CardHeader><CardTitle>Charge agentique</CardTitle></CardHeader><CardContent className="grid gap-2"><p>{usage.profileCount ?? 0} profils</p><p>{usage.activeSessionCount ?? 0} sessions actives</p><p>Charges lourdes : navigateur {usage.heavyLoads?.browser ?? 0} · MCP {usage.heavyLoads?.mcp ?? 0} · cron {usage.heavyLoads?.cron ?? 0} · sous-agents {usage.heavyLoads?.subagents ?? 0}</p><p>Mesure : {date(usage.sampledAt)}</p></CardContent></Card>
            </> : <Alert className="md:col-span-2" title="Mesure de capacité absente" variant="info">Lancez une collecte depuis les opérations pour obtenir CPU, RAM, disque et concurrence active.</Alert>}
            {canConfigureRuntime(access.role) ? <Card className="md:col-span-2"><CardHeader><CardTitle>Seuils de protection</CardTitle></CardHeader><CardContent><InstallationCapacityPolicy endpoint={endpoint} limits={capability?.limits ?? null} /></CardContent></Card> : null}
          </TabsContent>

          <TabsContent className="grid gap-4 pt-4" value="costs">
            {budget ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><WalletIcon />Budget {budget.period}</CardTitle></CardHeader><CardContent className="grid gap-2"><p>Infrastructure : {money(budget.infrastructureLimitMicros, budget.currency)}</p><p>Inférence : {money(budget.inferenceLimitMicros, budget.currency)}</p><p>Global : {money(budget.globalLimitMicros, budget.currency)}</p><p>Seuil : {budget.alertThresholdPercent}% · hard cap : {budget.hardCapAction}</p></CardContent></Card> : <Alert title="Aucun budget configuré" variant="info">Les plafonds infrastructure et inférence restent séparés jusqu’à configuration explicite.</Alert>}
            {usage?.inferenceCostMicros !== null && usage?.inferenceCostMicros !== undefined ? <Alert title="Coût d’inférence observé" variant="info">{money(usage.inferenceCostMicros, usage.costCurrency ?? "USD")} · source {usage.costSource ?? "inconnue"} · confiance {usage.confidence ?? "inconnue"}. Aucun taux de change implicite n’est appliqué.</Alert> : null}
            {canConfigureRuntime(access.role) ? <Card><CardHeader><CardTitle>Configurer les plafonds</CardTitle></CardHeader><CardContent><InstallationBudgetForm budget={budget} endpoint={endpoint} /></CardContent></Card> : null}
          </TabsContent>

          <TabsContent className="grid gap-3 pt-4" value="operations">
            <Card><CardHeader><CardTitle>Nouvelle opération</CardTitle></CardHeader><CardContent className="grid gap-4"><InstallationOperations canManage={canManage} endpoint={endpoint} lifecycle={capability?.lifecycle ?? []} managementLevel={installation.managementLevel} profiles={(capability?.profiles ?? []).map((profile) => profile.name)} />{canManage ? <InstallationUpgradeActions candidates={operations.filter((operation) => operation.type === "upgrade" && operation.backupId).map((operation) => ({ id: operation.id, sourceVersion: operation.sourceVersion, targetVersion: operation.targetVersion, backupId: operation.backupId }))} endpoint={endpoint} features={capability?.features ?? []} profiles={(capability?.profiles ?? []).map((profile) => profile.name)} /> : null}</CardContent></Card>
            {operations.length ? operations.map((operation) => <Card size="sm" key={operation.id}><CardContent className="flex items-center justify-between gap-3"><div><p className="font-medium">{operation.type}</p><p className="text-xs text-muted-foreground">{date(operation.createdAt)}</p></div><Badge variant="secondary">{operation.status}</Badge></CardContent></Card>) : <Alert title="Aucune opération" variant="info">Les démarrages, upgrades et rollbacks apparaîtront ici avec leur initiateur et leurs étapes.</Alert>}
          </TabsContent>

          <TabsContent className="grid gap-3 pt-4" value="backups">
            <Card><CardHeader><CardTitle>Sauvegarde chiffrée</CardTitle></CardHeader><CardContent>{canManage ? <InstallationBackupActions backups={backups.map((backup) => ({ id: backup.id, status: backup.status }))} endpoint={endpoint} features={capability?.features ?? []} managed={installation.managementLevel === "managed"} profiles={(capability?.profiles ?? []).map((profile) => profile.name)} /> : <p className="text-sm text-muted-foreground">Seul un Owner peut créer, restaurer ou vérifier une sauvegarde.</p>}</CardContent></Card>
            {backups.length ? backups.map((backup) => <Card size="sm" key={backup.id}><CardContent className="flex items-center justify-between gap-3"><div><p className="font-medium">Sauvegarde {date(backup.createdAt)}</p><p className="text-xs text-muted-foreground">Secrets : {backup.secretsPolicy} · intégrité : {backup.verifiedAt ? "vérifiée" : "à vérifier"}</p></div><Badge variant="secondary">{backup.status}</Badge></CardContent></Card>) : <Alert title="Aucune sauvegarde" variant="info">Une installation externe ne reçoit jamais de sauvegarde implicite.</Alert>}
          </TabsContent>

          <TabsContent className="grid gap-4 pt-4" value="security">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheckIcon />Identités Edge</CardTitle></CardHeader><CardContent className="grid gap-2">{identities.length ? identities.map((identity) => <div className="flex justify-between gap-3" key={identity.id}><code className="truncate text-xs">{identity.fingerprint}</code><Badge variant="secondary">{identity.status}</Badge></div>) : <p className="text-sm text-muted-foreground">Connexion directe avec secret de service ; aucune identité enrôlée.</p>}</CardContent></Card>
            {installation.transport === "relay" && canConfigureRuntime(access.role) ? <Card><CardHeader><CardTitle>Rotation mTLS</CardTitle></CardHeader><CardContent><RotateRelayIdentity endpoint={endpoint} /></CardContent></Card> : null}
          </TabsContent>

          <TabsContent className="grid gap-3 pt-4" value="audit">
            {audit.length ? audit.map((event) => <div className="flex items-start justify-between gap-3 border-b py-3" key={event.id}><div><p className="font-medium">{event.action}</p><p className="text-xs text-muted-foreground">{event.targetType}</p></div><span className="flex items-center gap-1 text-xs text-muted-foreground"><ClockIcon className="size-3" />{date(event.createdAt)}</span></div>) : <Alert title="Journal vide" variant="info">Aucun événement d’installation enregistré.</Alert>}
          </TabsContent>
        </Tabs>
      </div>

      <aside><Card className="sticky top-6"><CardHeader><CardTitle>Administration</CardTitle></CardHeader><CardContent>
        {canConfigureRuntime(access.role) ? <InstallationActions
          agents={workspaceAgents.map((agent) => ({ id: agent.id, name: agent.name, installationId: agent.installationId }))}
          endpoint={endpoint}
          installation={{ name: installation.name, origin: installation.origin, managementLevel: installation.managementLevel, archivedAt: installation.archivedAt }}
          lifecycle={capability?.lifecycle ?? []}
          profiles={capability?.profiles ?? []}
        /> : <Alert title="Lecture seule">Votre rôle permet de consulter la santé et les coûts sans modifier le runtime.</Alert>}
      </CardContent></Card></aside>
    </div>
  </div>;
}
