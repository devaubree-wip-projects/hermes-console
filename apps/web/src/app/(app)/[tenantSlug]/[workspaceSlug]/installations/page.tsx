import { and, asc, eq, ilike, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRightIcon,
  BanIcon,
  BoxIcon,
  CircleCheckIcon,
  CircleXIcon,
  Clock3Icon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  ServerIcon,
  ShieldXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { ConnectInstallationForm } from "@/components/installations/connect-installation-form";
import { EnrollInstallationForm } from "@/components/installations/enroll-installation-form";
import { PageHeading } from "@/components/product/page-heading";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { agents, runtimeInstallations, type RuntimeInstallationStatus } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canConfigureRuntime, getWorkspaceAccessBySlugs } from "@/lib/workspace";

const statusPresentation = {
  pending_enrollment: { label: "Enrôlement requis", variant: "warning", icon: Clock3Icon },
  checking: { label: "Vérification", variant: "warning", icon: RefreshCwIcon },
  ready: { label: "Prêt", variant: "success", icon: CircleCheckIcon },
  degraded: { label: "Dégradé", variant: "warning", icon: TriangleAlertIcon },
  offline: { label: "Hors ligne", variant: "destructive", icon: CircleXIcon },
  incompatible: { label: "Incompatible", variant: "destructive", icon: BanIcon },
  upgrading: { label: "Mise à niveau", variant: "warning", icon: RefreshCwIcon },
  rollback_required: { label: "Rollback requis", variant: "destructive", icon: RotateCcwIcon },
  revoked: { label: "Révoqué", variant: "destructive", icon: ShieldXIcon },
} as const;

const statuses = Object.keys(statusPresentation) as RuntimeInstallationStatus[];

export default async function InstallationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; workspaceSlug: string }>;
  searchParams: Promise<{ q?: string; status?: string; version?: string; workspace?: string; archived?: string }>;
}) {
  const { tenantSlug, workspaceSlug } = await params;
  const filters = await searchParams;
  const user = await requireUser();
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, user.id);
  if (!access) notFound();

  const query = filters.q?.trim() ?? "";
  const status = statuses.includes(filters.status as RuntimeInstallationStatus)
    ? filters.status as RuntimeInstallationStatus
    : null;
  const version = filters.version?.trim() ?? "";
  const workspaceScope = filters.workspace === "current" ? "current" : "all";
  const installationFilter = and(
    eq(runtimeInstallations.tenantId, access.tenant.id),
    filters.archived === "1" ? sql`true` : isNull(runtimeInstallations.archivedAt),
    query ? ilike(runtimeInstallations.name, `%${query}%`) : sql`true`,
    status ? eq(runtimeInstallations.status, status) : sql`true`,
    version ? ilike(runtimeInstallations.hermesVersion, `%${version}%`) : sql`true`,
    workspaceScope === "current"
      ? sql`exists (
          select 1 from ${agents} as workspace_agents
          where workspace_agents.runtime_installation_id = ${runtimeInstallations.id}
            and workspace_agents.workspace_id = ${access.workspace.id}
        )`
      : sql`true`,
  );
  const [installations, workspaceAgents] = await Promise.all([
    db.select({
      installation: runtimeInstallations,
      agentCount: sql<number>`count(${agents.id})::int`,
    }).from(runtimeInstallations)
      .leftJoin(agents, eq(agents.runtimeInstallationId, runtimeInstallations.id))
      .where(installationFilter)
      .groupBy(runtimeInstallations.id)
      .orderBy(asc(runtimeInstallations.createdAt)),
    db.select({ id: agents.id, name: agents.name }).from(agents)
      .where(eq(agents.workspaceId, access.workspace.id))
      .orderBy(asc(agents.createdAt)),
  ]);

  return <div className="min-h-full overflow-y-auto bg-background" data-testid="installations-content">
    <PageHeading
      eyebrow="Infrastructure agentique"
      title="Installations Hermes"
      description="Pilotez le runtime Docker local ou reliez un Hermes déjà présent sur un autre VPS via son Edge sécurisé."
    />
    <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-4" aria-labelledby="installation-list-title">
        <h2 className="sr-only" id="installation-list-title">Installations enregistrées</h2>
        <form className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_150px_140px_150px_auto]">
          <div className="relative"><SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Rechercher une installation" className="pl-8" defaultValue={query} name="q" placeholder="Rechercher par nom" /></div>
          <select aria-label="Filtrer par état" className="h-8 rounded-lg border bg-background px-2 text-sm" defaultValue={status ?? ""} name="status">
            <option value="">Tous les états</option>
            {statuses.map((value) => <option key={value} value={value}>{statusPresentation[value].label}</option>)}
          </select>
          <Input aria-label="Filtrer par version Hermes" defaultValue={version} name="version" placeholder="Version Hermes" />
          <select aria-label="Filtrer par workspace" className="h-8 rounded-lg border bg-background px-2 text-sm" defaultValue={workspaceScope} name="workspace">
            <option value="all">Tout le tenant</option>
            <option value="current">Ce workspace</option>
          </select>
          <Button type="submit" variant="outline">Filtrer</Button>
        </form>
        {installations.length ? installations.map(({ installation, agentCount }) => {
          const status = statusPresentation[installation.status];
          const StatusIcon = status.icon;

          return <Card className="shadow-none" key={installation.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-muted"><ServerIcon className="size-5" /></span>
                  <div><CardTitle><Link className="hover:underline" href={`/${tenantSlug}/${workspaceSlug}/installations/${installation.id}`}>{installation.name}</Link></CardTitle><p className="mt-1 font-mono text-xs text-muted-foreground">{installation.installationKey}</p></div>
                </div>
                <Badge variant={status.variant}>
                  <StatusIcon aria-hidden="true" />
                  {status.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <p className="break-all text-muted-foreground">{installation.gatewayUrl}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{installation.origin.replaceAll("_", " ")}</Badge>
                <Badge variant="secondary">{installation.managementLevel}</Badge>
                <Badge variant="secondary">{installation.transport}</Badge>
                <Badge variant="secondary"><BoxIcon />{agentCount} agent{agentCount > 1 ? "s" : ""}</Badge>
              </div>
              {installation.statusDetail ? <p className="text-amber-700 dark:text-amber-400">{installation.statusDetail}</p> : null}
              <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                <span>Hermes {installation.hermesVersion ?? "inconnu"} · vu {installation.lastSeenAt ? installation.lastSeenAt.toLocaleString("fr-FR") : "jamais"}</span>
                <Button asChild size="sm" variant="ghost"><Link href={`/${tenantSlug}/${workspaceSlug}/installations/${installation.id}`}>Ouvrir<ArrowRightIcon /></Link></Button>
              </div>
            </CardContent>
          </Card>;
        }) : <Alert title="Aucune installation" variant="info">Lancez le runtime local ou connectez un Edge existant.</Alert>}
      </section>
      <aside className="space-y-4">
        <Card className="shadow-none">
          <CardHeader><CardTitle>Connecter un Hermes existant</CardTitle></CardHeader>
          <CardContent>
            {canConfigureRuntime(access.role) ? (
              <ConnectInstallationForm
                agents={workspaceAgents}
                endpoint={`/api/${tenantSlug}/${workspaceSlug}/installations`}
              />
            ) : <Alert title="Lecture seule">Seul un Owner peut ajouter une installation.</Alert>}
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader><CardTitle>Enrôler via Relay</CardTitle></CardHeader>
          <CardContent>
            {canConfigureRuntime(access.role) ? (
              <EnrollInstallationForm endpoint={`/api/${tenantSlug}/${workspaceSlug}/installations`} />
            ) : <Alert title="Lecture seule">Seul un Owner peut créer un jeton d’enrôlement.</Alert>}
          </CardContent>
        </Card>
      </aside>
    </div>
  </div>;
}
