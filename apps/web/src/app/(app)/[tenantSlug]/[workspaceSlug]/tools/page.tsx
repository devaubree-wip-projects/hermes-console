import { redirect } from "next/navigation"

export default async function LegacyToolsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; workspaceSlug: string }>
}) {
  const { tenantSlug, workspaceSlug } = await params
  redirect(`/${tenantSlug}/${workspaceSlug}/settings/tools`)
}
