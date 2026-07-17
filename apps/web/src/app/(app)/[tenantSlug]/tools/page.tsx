import { redirect } from "next/navigation"

export default async function LegacyToolsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>
}) {
  const { tenantSlug } = await params
  redirect(`/${tenantSlug}/settings/tools`)
}
