import { redirect } from "next/navigation"

export default async function SettingsIndexPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; workspaceSlug: string }>
}) {
  const { tenantSlug, workspaceSlug } = await params
  redirect(`/${tenantSlug}/${workspaceSlug}/settings/chat`)
}
