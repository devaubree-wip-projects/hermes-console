import { SettingsRoute } from "@/components/settings/settings-route"

export default function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; workspaceSlug: string; panel: string }>
  searchParams: Promise<{ agentId?: string | string[] }>
}) {
  return <SettingsRoute params={params} searchParams={searchParams} />
}
