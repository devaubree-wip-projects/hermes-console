import Link from "next/link"
import { asc, eq } from "drizzle-orm"
import { PlusIcon } from "lucide-react"
import { notFound } from "next/navigation"
import { db } from "@/db"
import { agents } from "@/db/schema"
import { MessagingIntegrationsPanel } from "@/components/settings/messaging-integrations-panel"
import { SettingsPanelHeader } from "@/components/settings/settings-row"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { requireUser } from "@/lib/auth"
import { canConfigureRuntime, getTenantAccessBySlug } from "@/lib/workspace"

export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>
  searchParams: Promise<{ agentId?: string | string[] }>
}) {
  const [{ tenantSlug }, query] = await Promise.all([params, searchParams])
  const user = await requireUser()
  const access = await getTenantAccessBySlug(tenantSlug, user.id)
  if (!access) notFound()

  const workspaceBase = `/${tenantSlug}`
  const owner = canConfigureRuntime(access.role)
  const agentId = Array.isArray(query.agentId) ? query.agentId[0] : query.agentId

  const agentRows = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      runtimeState: agents.runtimeState,
    })
    .from(agents)
    .where(eq(agents.workspaceId, access.workspace.id))
    .orderBy(asc(agents.createdAt))

  const activeAgent = agentRows.find((agent) => agent.id === agentId) ?? agentRows[0]

  return (
    <div className="w-full px-4 py-6 md:px-6 lg:px-8">
      {activeAgent ? (
        <MessagingIntegrationsPanel
          key={activeAgent.id}
          agents={agentRows}
          activeAgent={activeAgent}
          integrationsBase={`${workspaceBase}/integrations`}
          apiEndpoint={`/api/${tenantSlug}/agents/${activeAgent.slug}/messaging`}
        />
      ) : (
        <div className="space-y-8">
          <SettingsPanelHeader
            title="Intégrations"
            description="Reliez Telegram et Discord au profil Hermes de chaque agent."
          />
          <Alert variant="info" title="Aucun agent">
            Créez un agent avant de configurer ses channels Telegram ou Discord.
          </Alert>
          {owner ? (
            <Button asChild>
              <Link href={`${workspaceBase}/agents/new`}><PlusIcon />Créer un agent</Link>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
