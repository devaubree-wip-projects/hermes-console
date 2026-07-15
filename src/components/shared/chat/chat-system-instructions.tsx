"use client"

import { useMemo } from "react"
import { useAssistantInstructions } from "@assistant-ui/react"
import { useAuiState } from "@assistant-ui/store"
import { buildClientSystem } from "@/lib/shared/chat/chat-request-context"
import { CHAT_TOOLS } from "@/lib/shared/chat/chat-tool-registry"
import { useChatToolsStore } from "@/lib/shared/chat/chat-tools-store"

export function ChatSystemInstructions() {
  const enabled = useChatToolsStore((state) => state.enabled)
  const enabledIds = useMemo(
    () => CHAT_TOOLS.filter((tool) => enabled[tool.id]).map((tool) => tool.id),
    [enabled],
  )
  const includeThreadTitle = useChatToolsStore((state) => state.includeThreadTitle)
  const threadTitle = useAuiState(
    (state) =>
      state.threads.threadItems.find((thread) => thread.id === state.threads.mainThreadId)
        ?.title,
  )

  const mechanicMode = useChatToolsStore((state) => state.mechanicMode)

  const instruction = buildClientSystem({
    enabledIds,
    mechanicMode,
    threadTitle: includeThreadTitle && threadTitle ? threadTitle : undefined,
  })

  useAssistantInstructions(
    instruction ? { instruction } : { instruction: "", disabled: true },
  )

  return null
}
