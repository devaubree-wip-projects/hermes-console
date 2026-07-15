import { redirect } from "next/navigation"

export default async function LegacyTeamPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; workspaceSlug: string }>
}) {
  const { tenantSlug, workspaceSlug } = await params
  redirect(`/${tenantSlug}/${workspaceSlug}/settings/members`)
}
