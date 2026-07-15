import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import { agents } from "@/db/schema"
import { ChatPageClient } from "@/components/shared/chat/chat-page-client"
import { ChatPageLoading } from "@/components/shared/chat/chat-page-loading"
import { XuluxChatProviders } from "@/components/shared/chat/runtime/xulux-chat-providers"
import { requireUser } from "@/lib/auth"
import { resolveActiveAgentQuery } from "@/lib/chat-agent-context"
import { resolveWorkspaceAgentId } from "@/lib/chat-agent-context.server"
import { getWorkspaceAccessBySlugs } from "@/lib/workspace"

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{
    tenantSlug: string
    workspaceSlug: string
    segments?: string[]
  }>
  searchParams: Promise<{
    agent?: string | string[]
    agentId?: string | string[]
  }>
}) {
  const { tenantSlug, workspaceSlug } = await params
  const query = await searchParams
  const user = await requireUser()
  const access = await getWorkspaceAccessBySlugs(
    tenantSlug,
    workspaceSlug,
    user.id,
  )
  if (!access) notFound()

  const agentSelector = resolveActiveAgentQuery({
    agent: Array.isArray(query.agent) ? query.agent[0] : query.agent,
    agentId: Array.isArray(query.agentId) ? query.agentId[0] : query.agentId,
  })
  const requestedAgentId = await resolveWorkspaceAgentId(
    access.workspace.id,
    agentSelector,
  )
  const defaultAgentId = await resolveWorkspaceAgentId(access.workspace.id, {})
  const activeAgentId = requestedAgentId
    ?? defaultAgentId

  if (!activeAgentId) {
    redirect(`/${tenantSlug}/${workspaceSlug}/agents/new`)
  }

  const [activeAgent] = await db
    .select({ name: agents.name, slug: agents.slug })
    .from(agents)
    .where(
      and(
        eq(agents.id, activeAgentId),
        eq(agents.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)

  if (!activeAgent) notFound()

  const chatBase = `/${tenantSlug}/${workspaceSlug}/d/chat`
  const apiBase = `/api/${tenantSlug}/${workspaceSlug}`

  return (
    <XuluxChatProviders
      activeAgentId={activeAgentId}
      activeAgentName={activeAgent.name}
      activeAgentSlug={activeAgent.slug}
      urlAgentId={activeAgentId === defaultAgentId ? null : activeAgentId}
      apiBase={apiBase}
      chatBase={chatBase}
      settingsUrl={`/${tenantSlug}/${workspaceSlug}/settings/chat`}
    >
      <Suspense fallback={<ChatPageLoading />}>
        <ChatPageClient />
      </Suspense>
    </XuluxChatProviders>
  )
}
