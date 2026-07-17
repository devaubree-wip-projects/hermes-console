import { redirect } from "next/navigation"

export default async function LegacyModelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>
  searchParams: Promise<{ agentId?: string | string[] }>
}) {
  const [{ tenantSlug }, query] = await Promise.all([params, searchParams])
  const agentId = Array.isArray(query.agentId) ? query.agentId[0] : query.agentId
  const suffix = agentId ? `?agentId=${encodeURIComponent(agentId)}` : ""
  redirect(`/${tenantSlug}/settings/models${suffix}`)
}
