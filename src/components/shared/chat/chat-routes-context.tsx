"use client"

import { createContext, useContext, useMemo } from "react"

export type ChatRoutes = {
  /** Base path where the chat is mounted, e.g. "/v1-xulux/d/chat" or "/v2/d/chat". */
  base: string
  /** Base path including agent routing context, useful to stay in the same agent session context. */
  baseWithAgent: string
  /** Deep-link URL for a given thread id: `${base}/c/${id}`. */
  threadUrl: (threadId: string) => string
  /** Optional settings URL for the host shell. When absent, the chat hides the settings entry. */
  settingsUrl?: string
  /** Active agent identifier for this runtime context. */
  activeAgentId?: string | null
  /** Human-readable active agent name used by the session UI. */
  activeAgentName?: string | null
}

const ChatRoutesContext = createContext<ChatRoutes | null>(null)

export function ChatRoutesProvider({
  base,
  activeAgentId,
  activeAgentName,
  urlAgentId,
  settingsUrl,
  children,
}: {
  base: string
  activeAgentId?: string | null
  activeAgentName?: string | null
  /** Agent id kept in chat URLs only when a non-default agent is active. */
  urlAgentId?: string | null
  settingsUrl?: string
  children: React.ReactNode
}) {
  const hasAgentId = typeof urlAgentId === "string" && urlAgentId.length > 0
  const baseWithAgent = hasAgentId
    ? `${base}?agentId=${encodeURIComponent(urlAgentId)}`
    : base

  const value = useMemo<ChatRoutes>(
    () => ({
      base,
      baseWithAgent,
      threadUrl: (threadId: string) =>
        hasAgentId
          ? `${base}/c/${threadId}?agentId=${encodeURIComponent(urlAgentId)}`
          : `${base}/c/${threadId}`,
      activeAgentId,
      activeAgentName,
      settingsUrl,
    }),
    [activeAgentId, activeAgentName, base, baseWithAgent, settingsUrl, hasAgentId, urlAgentId],
  )

  return (
    <ChatRoutesContext.Provider value={value}>
      {children}
    </ChatRoutesContext.Provider>
  )
}

export function useChatRoutes(): ChatRoutes {
  const ctx = useContext(ChatRoutesContext)
  if (!ctx) {
    throw new Error("useChatRoutes must be used within a ChatRoutesProvider")
  }
  return ctx
}
