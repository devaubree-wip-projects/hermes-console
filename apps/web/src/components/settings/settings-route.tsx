import { notFound } from "next/navigation"
import { SettingsFrame } from "@/components/settings/settings-frame"
import { SettingsPanel } from "@/components/settings/settings-panel"
import { resolveSettingsPanel } from "@/components/settings/settings-routes"

export async function SettingsRoute({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; workspaceSlug: string; panel: string }>
  searchParams: Promise<{ agentId?: string | string[] }>
}) {
  const [{ tenantSlug, workspaceSlug, panel: panelSegment }, query] = await Promise.all([params, searchParams])
  const workspaceBase = `/${tenantSlug}/${workspaceSlug}`
  const panel = resolveSettingsPanel([panelSegment])
  if (!panel) notFound()
  const agentId = Array.isArray(query.agentId) ? query.agentId[0] : query.agentId

  return (
    <SettingsFrame active={panel} workspaceBase={workspaceBase}>
      <SettingsPanel
        panel={panel}
        tenantSlug={tenantSlug}
        workspaceSlug={workspaceSlug}
        agentId={agentId}
      />
    </SettingsFrame>
  )
}
