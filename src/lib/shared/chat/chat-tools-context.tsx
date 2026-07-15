"use client"

import { useAui } from "@assistant-ui/store"
import { useEffect } from "react"
import { useChatToolsStore } from "@/lib/shared/chat/chat-tools-store"

export function ChatToolsContext() {
  const api = useAui()
  const enabled = useChatToolsStore((state) => state.enabled)
  const mcpServers = useChatToolsStore((state) => state.mcpServers)
  const mechanicMode = useChatToolsStore((state) => state.mechanicMode)

  useEffect(() => {
    return api.modelContext().register({
      getModelContext: () => ({
        config: {
          enabledTools: useChatToolsStore.getState().getEnabledToolIds(),
          mcpServers: useChatToolsStore.getState().getEnabledMcpServers(),
          mode: useChatToolsStore.getState().mechanicMode ? "mechanic" : null,
        } as Record<string, unknown>,
      }),
    })
  }, [api, enabled, mcpServers, mechanicMode])

  return null
}
