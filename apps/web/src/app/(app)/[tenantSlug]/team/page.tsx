import { redirect } from "next/navigation"

export default async function LegacyTeamPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>
}) {
  const { tenantSlug } = await params
  redirect(`/${tenantSlug}/settings/members`)
}
