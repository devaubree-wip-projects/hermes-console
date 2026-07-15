"use client"

import type { ChatToolId } from "@/lib/shared/chat/chat-tool-registry"
import { useChatToolsStore } from "@/lib/shared/chat/chat-tools-store"

// Single source of truth for the client-side system instruction, used both by
// the transport (request body) and ChatSystemInstructions (model context).
export function buildClientSystem({
  enabledIds,
  mechanicMode,
  threadTitle,
}: {
  enabledIds: ChatToolId[]
  mechanicMode: boolean
  threadTitle?: string | undefined
}): string {
  return [
    enabledIds.length > 0
      ? `You have access to these tools: ${enabledIds.join(", ")}.`
      : null,
    enabledIds.includes("web_search")
      ? "When the user asks about current events, real-time data, or anything that may be outside your training data — or invokes /search — call web_search and ground your answer in the returned results, citing the source URLs."
      : null,
    // In mechanic mode the backend MECHANIC_SYSTEM already drives canvas usage
    // (diagnostic protocol, guide template, svg diagrams) — skip the generic rule.
    enabledIds.includes("canvas") && !mechanicMode
      ? "When the user asks you to draft, write, or iterate on a substantive document (doc, article, long email, plan, spec — roughly 15+ lines meant to be reused or edited) — or invokes /canvas — call the canvas tool with a short title and the FULL document as markdown in content; it renders live in a side panel. Then keep your chat reply to one or two sentences. Never use canvas for short answers or ordinary conversation."
      : null,
    "When the user asks to export, download, or save content as PDF or Word, call the matching tool with well-structured markdown content.",
    threadTitle
      ? `Use "${threadTitle}" as the document title when exporting this conversation unless the user specifies otherwise.`
      : null,
  ]
    .filter(Boolean)
    .join(" ")
}

// Request fields read at send time from the tools store. Injected explicitly
// by the transport (chat-runtime-provider) because model-context registration
// happens on the outer runtime while AssistantChatTransport reads the inner
// per-thread runtime — registrations never reach the request body otherwise.
export function buildChatRequestFields(): {
  config: Record<string, unknown>
  system: string
} {
  const state = useChatToolsStore.getState()
  const enabledIds = state.getEnabledToolIds()
  return {
    config: {
      enabledTools: enabledIds,
      mcpServers: state.getEnabledMcpServers(),
      mode: state.mechanicMode ? "mechanic" : null,
    },
    system: buildClientSystem({
      enabledIds,
      mechanicMode: state.mechanicMode,
    }),
  }
}
