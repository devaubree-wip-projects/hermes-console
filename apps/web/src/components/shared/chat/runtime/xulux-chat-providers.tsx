"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { ChatRunTracker } from "@/components/shared/chat/runtime/chat-run-tracker"
import { ChatRuntimeProvider } from "@/components/shared/chat/runtime/chat-runtime-provider"
import { ChatThreadUrlSync } from "@/components/shared/chat/chat-thread-url-sync"
import { ChatRoutesProvider } from "@/components/shared/chat/chat-routes-context"
import { Toaster } from "@/components/shared/chat/ui/sonner"
import { HermesProvider } from "@/lib/hermes/client"
import { useChatRunStore } from "@/lib/shared/chat/chat-run-store"

function parseThreadIdFromPathname(pathname: string): string | undefined {
  const match = pathname.match(/\/d\/chat\/c\/([^/]+)$/)
  return match?.[1]
}

function deriveApiBaseFromChatBase(chatBase: string) {
  const match = chatBase.match(/^\/(.+?)\/(.+?)\/d\/chat$/)
  if (!match) return "/api"
  return `/api/${match[1]}/${match[2]}`
}

function ChatRuntimeLayer({
  active,
  threadId,
  sessionsEndpoint,
  inferenceEndpoint,
  agentsEndpoint,
  activeAgentId,
  children,
}: {
  active: boolean
  threadId?: string
  sessionsEndpoint: string
  inferenceEndpoint: string
  agentsEndpoint: string
  activeAgentId?: string | null
  children: React.ReactNode
}) {
  return (
    <ChatRuntimeProvider
      active={active}
      threadId={threadId}
      sessionsEndpoint={sessionsEndpoint}
      inferenceEndpoint={inferenceEndpoint}
      agentsEndpoint={agentsEndpoint}
      activeAgentId={activeAgentId}
    >
      <ChatRunTracker />
      <ChatThreadUrlSync threadId={threadId} />
      {children}
    </ChatRuntimeProvider>
  )
}

export function XuluxChatProviders({
  children,
  chatBase,
  settingsUrl,
  apiBase,
  activeAgentId,
  activeAgentName,
  activeAgentSlug,
  urlAgentId,
}: {
  children: React.ReactNode
  /** Base path where the chat is mounted for this host shell, e.g. "/v2/d/chat”. */
  chatBase: string
  /** Optional settings URL surfaced by the chat header. */
  settingsUrl?: string
  /** API prefix for chat routes. */
  apiBase?: string
  /** Active agent identifier to scope the chat thread context. */
  activeAgentId?: string | null
  /** Active agent label displayed above the session list. */
  activeAgentName?: string | null
  /** Agent slug used only to request the short-lived, profile-scoped bridge ticket. */
  activeAgentSlug: string
  /** Non-default agent id to preserve in chat URLs. */
  urlAgentId?: string | null
}) {
  const pathname = usePathname()
  const isChatRoute = pathname.startsWith(chatBase)
  const hasRunning = useChatRunStore((s) => s.runningThreadIds.length > 0)
  const threadId = isChatRoute ? parseThreadIdFromPathname(pathname) : undefined

  const effectiveApiBase = apiBase ?? deriveApiBaseFromChatBase(chatBase)
  const ticketEndpoint = `${effectiveApiBase}/agents/${encodeURIComponent(activeAgentSlug)}/runtime-ticket`
  const sessionsEndpoint = `${effectiveApiBase}/agents/${encodeURIComponent(activeAgentSlug)}/sessions`
  const inferenceEndpoint = `${effectiveApiBase}/agents/${encodeURIComponent(activeAgentSlug)}/inference`
  const agentsEndpoint = `${effectiveApiBase}/agents`

  const [warm, setWarm] = useState(isChatRoute)

  useEffect(() => {
    if (isChatRoute || hasRunning) {
      setWarm(true)
      return
    }
    const timer = setTimeout(() => setWarm(false), 5_000)
    return () => clearTimeout(timer)
  }, [isChatRoute, hasRunning])

  const mountRuntime = isChatRoute || hasRunning || warm

  return (
    <ChatRoutesProvider
      base={chatBase}
      settingsUrl={settingsUrl}
      activeAgentId={activeAgentId}
      activeAgentName={activeAgentName}
      currentThreadId={threadId}
      urlAgentId={urlAgentId}
    >
      <Toaster position={isChatRoute ? "top-center" : "bottom-right"} />
      {mountRuntime ? (
        <HermesProvider key={activeAgentId ?? "no-agent"} ticketEndpoint={ticketEndpoint}>
          <ChatRuntimeLayer
            active={isChatRoute}
            threadId={threadId}
            sessionsEndpoint={sessionsEndpoint}
            inferenceEndpoint={inferenceEndpoint}
            agentsEndpoint={agentsEndpoint}
            activeAgentId={activeAgentId}
          >
            {children}
          </ChatRuntimeLayer>
        </HermesProvider>
      ) : (
        children
      )}
    </ChatRoutesProvider>
  )
}
