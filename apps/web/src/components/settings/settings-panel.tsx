import Link from "next/link"
import { and, asc, eq } from "drizzle-orm"
import { BotIcon, PlusIcon } from "lucide-react"
import { db } from "@/db"
import { agents, tenantMemberships, users, workspaceMemberships } from "@/db/schema"
import { InferenceSettings } from "@/components/agents/inference-settings"
import { ChatSettingsPanel, DocumentsSettingsPanel } from "@/components/settings/settings-client-panels"
import { ToolsSettingsPanel, type ToolsetItem } from "@/components/settings/tools-settings-panel"
import { GeneralSection } from "@/components/settings/general-section"
import { PermissionsSection } from "@/components/settings/permissions-section"
import { RuntimeAccessSection } from "@/components/settings/runtime-access-section"
import { SettingsPanelHeader, SettingsRow, SettingsSection } from "@/components/settings/settings-row"
import type { SettingsPanelId } from "@/components/settings/settings-routes"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { requireUser } from "@/lib/auth"
import { getRuntimeAccess, hermesFetch } from "@/lib/hermes/server"
import { runtimeInstallationForAgent } from "@/lib/hermes/installations"
import { normalizePermissions } from "@/lib/permissions"
import { canConfigureRuntime, getWorkspaceAccessBySlugs } from "@/lib/workspace"

type CapabilityRecord = Record<string, unknown>

function toToolsetItems(value: unknown): ToolsetItem[] {
  const list = Array.isArray(value) ? value : []
  return list
    .filter((item): item is CapabilityRecord => Boolean(item) && typeof item === "object")
    .map((item) => ({
      name: String(item.name ?? ""),
      label: String(item.label ?? item.name ?? "Outil"),
      description: String(item.description ?? "Configuré dans le profil Hermes."),
      enabled: item.enabled !== false,
    }))
    .filter((item) => item.name)
}

function ReadOnlyNotice({ role }: { role: string }) {
  return (
    <Alert variant="info" title="Accès en lecture seule">
      Votre rôle {role} permet de consulter cette configuration. Seul un Owner peut la modifier.
    </Alert>
  )
}

export async function SettingsPanel({
  panel,
  tenantSlug,
  workspaceSlug,
  agentId,
}: {
  panel: SettingsPanelId
  tenantSlug: string
  workspaceSlug: string
  agentId?: string
}) {
  const currentUser = await requireUser()
  const access = await getWorkspaceAccessBySlugs(tenantSlug, workspaceSlug, currentUser.id)
  if (!access) return null

  const workspaceBase = `/${tenantSlug}/${workspaceSlug}`
  const owner = canConfigureRuntime(access.role)

  if (panel === "chat") return <ChatSettingsPanel />
  if (panel === "documents") return <DocumentsSettingsPanel />

  if (panel === "general") {
    return (
      <div className="space-y-8">
        <SettingsPanelHeader
          title="Général"
          description="Gérez l’identité visible de cet espace de travail."
        />
        {owner ? (
          <GeneralSection workspaceId={access.workspace.id} name={access.workspace.name} />
        ) : <ReadOnlyNotice role={access.role} />}
      </div>
    )
  }

  if (panel === "members") {
    const memberRows = await db
      .select({
        user: users,
        role: tenantMemberships.role,
        overrideRole: workspaceMemberships.role,
        denied: workspaceMemberships.denied,
      })
      .from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .leftJoin(
        workspaceMemberships,
        and(
          eq(workspaceMemberships.userId, users.id),
          eq(workspaceMemberships.workspaceId, access.workspace.id),
        ),
      )
      .where(eq(tenantMemberships.tenantId, access.tenant.id))

    return (
      <div className="space-y-8">
        <SettingsPanelHeader
          title="Membres"
          description="Consultez les rôles hérités du tenant et les exceptions propres à ce workspace."
        />
        <SettingsSection title="Équipe">
          {memberRows.map(({ user, role, overrideRole, denied }) => (
            <SettingsRow
              key={user.id}
              label={`${user.name}${user.id === currentUser.id ? " (vous)" : ""}`}
              description={user.email}
              control={(
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{denied ? "Refusé" : overrideRole ?? role}</Badge>
                  {overrideRole ? <Badge variant="secondary">Override</Badge> : null}
                </div>
              )}
            />
          ))}
        </SettingsSection>
        {owner ? (
          <p className="text-sm text-muted-foreground">
            Le modèle RBAC est actif. L’envoi d’invitations sera ajouté à cette surface ultérieurement.
          </p>
        ) : null}
      </div>
    )
  }

  const agentRows = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      runtimeState: agents.runtimeState,
      hermesProfileName: agents.hermesProfileName,
    })
    .from(agents)
    .where(eq(agents.workspaceId, access.workspace.id))
    .orderBy(asc(agents.createdAt))

  if (panel === "models") {
    const activeAgent = agentRows.find((agent) => agent.id === agentId) ?? agentRows[0]
    return (
      <div className="space-y-8">
        <SettingsPanelHeader
          title="Modèles"
          description="Connectez un fournisseur et choisissez le modèle utilisé par les nouvelles sessions de chaque agent."
        />
        {activeAgent ? (
          <InferenceSettings
            agents={agentRows}
            activeAgent={activeAgent}
            modelsBase={`${workspaceBase}/settings/models`}
            apiEndpoint={`/api/${tenantSlug}/${workspaceSlug}/agents/${activeAgent.slug}/inference`}
            ticketEndpoint={`/api/${tenantSlug}/${workspaceSlug}/agents/${activeAgent.slug}/runtime-ticket`}
            newSessionHref={`${workspaceBase}/d/chat?agentId=${activeAgent.id}`}
            embedded
          />
        ) : (
          <div className="py-12 text-center">
            <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted">
              <BotIcon className="size-5" />
            </span>
            <h2 className="mt-4 text-lg font-semibold">Aucun agent à configurer</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Créez un agent avant de choisir son fournisseur et son modèle.
            </p>
            {owner ? (
              <Button asChild className="mt-5">
                <Link href={`${workspaceBase}/agents/new`}><PlusIcon />Créer un agent</Link>
              </Button>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  const firstAgent = agentRows[0]

  if (panel === "permissions") {
    return (
      <div className="space-y-8">
        <SettingsPanelHeader
          title="Permissions"
          description="Garde-fous appliqués côté console. La restriction réelle du système de fichiers et du shell se règle dans Runtime."
        />
        {owner ? (
          <PermissionsSection
            workspaceId={access.workspace.id}
            permissions={normalizePermissions(access.workspace.permissions)}
            profile={firstAgent?.hermesProfileName ?? null}
            toolsetApiBase={`/api/${tenantSlug}/${workspaceSlug}/tools/toolsets`}
            runtimeHref={`${workspaceBase}/settings/runtime`}
          />
        ) : <ReadOnlyNotice role={access.role} />}
      </div>
    )
  }

  if (panel === "runtime") {
    const installation = firstAgent ? await runtimeInstallationForAgent(firstAgent.id) : null
    const runtimeAccess = firstAgent
      ? await getRuntimeAccess(firstAgent.hermesProfileName, { agentId: firstAgent.id }).catch(() => ({
          defaultCwd: null,
          branch: null,
          approvalMode: null,
          toolsets: [],
          mcpServers: [],
          offline: true,
        }))
      : null

    return (
      <div className="space-y-8">
        <SettingsPanelHeader
          title="Runtime"
          description="Consultez et réglez l’accès machine réel des agents de ce workspace."
        />
        <SettingsSection title="Connexion Hermes">
          <SettingsRow
            label="Adresse du runtime"
            description="Le runtime est partagé par l’installation et chaque requête reste limitée au profil de l’agent actif."
            control={(
              <code className="break-all rounded-md bg-muted px-2 py-1 font-mono text-xs">
                {installation?.gatewayHttpUrl ?? "Aucune installation"}
              </code>
            )}
          />
          <SettingsRow
            label="Accès navigateur"
            description="Les secrets ne sont jamais envoyés au navigateur. Le bridge accepte uniquement des tickets courts signés par cette application."
            control={<Badge variant="outline">Protégé</Badge>}
          />
        </SettingsSection>
        {runtimeAccess ? (
          <RuntimeAccessSection
            access={runtimeAccess}
            profile={firstAgent?.hermesProfileName ?? null}
            configApiBase={`/api/${tenantSlug}/${workspaceSlug}/runtime/config`}
            toolsHref={`${workspaceBase}/settings/tools`}
            integrationsHref={`${workspaceBase}/integrations`}
            canEdit={owner}
          />
        ) : (
          <Alert variant="info" title="Aucun agent">
            Créez un agent pour afficher son accès machine.
          </Alert>
        )}
      </div>
    )
  }

  if (panel === "tools") {
    const result = firstAgent
      ? await hermesFetch<unknown>(
          `/api/tools/toolsets?profile=${encodeURIComponent(firstAgent.hermesProfileName)}`,
          {},
          { agentId: firstAgent.id, profile: firstAgent.hermesProfileName },
        )
          .then((data) => ({ data, error: null as string | null }))
          .catch((error) => ({
            data: null,
            error: error instanceof Error ? error.message : "Runtime indisponible",
          }))
      : { data: null, error: "Créez d’abord un agent." }

    if (result.error) {
      return (
        <div className="space-y-8">
          <SettingsPanelHeader
            title="Outils"
            description="Activez ou désactivez les familles d’outils du profil Hermes principal."
          />
          <Alert variant="warning" title="Données indisponibles">
            {result.error}
          </Alert>
        </div>
      )
    }

    return (
      <ToolsSettingsPanel
        items={toToolsetItems(result.data)}
        profile={firstAgent?.hermesProfileName ?? null}
        apiBase={`/api/${tenantSlug}/${workspaceSlug}/tools/toolsets`}
        canEdit={owner}
      />
    )
  }

  return null
}
