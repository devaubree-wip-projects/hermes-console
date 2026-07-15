"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import {
  CHAT_TOOLS,
  type ChatToolId,
} from "@/lib/shared/chat/chat-tool-registry"
import {
  toMcpServerRequestConfig,
  type McpServerConfig,
  type McpServerHeader,
  type McpServerRequestConfig,
  type McpServerTestResult,
  type McpServerTransport,
} from "@/lib/shared/chat/mcp-server-config"

function buildDefaultEnabled(): Record<ChatToolId, boolean> {
  return Object.fromEntries(
    CHAT_TOOLS.map((tool) => [tool.id, tool.defaultEnabled]),
  ) as Record<ChatToolId, boolean>
}

type ChatToolsState = {
  enabled: Record<ChatToolId, boolean>
  mcpServers: McpServerConfig[]
  includeThreadTitle: boolean
  showTimestamps: boolean
  compactMessages: boolean
  autoScroll: boolean
  wrapCode: boolean
  showReasoning: boolean
  showToolCalls: boolean
  // Context alerts: warn (toast) when the conversation's context usage crosses a
  // threshold, offering to compact the thread or start a new conversation.
  contextAlertEnabled: boolean
  contextCompactThreshold: number
  contextNewThreshold: number
  // Agent spécialisé mécanique auto (persona + protocole diagnostic backend).
  mechanicMode: boolean
  setMechanicMode: (value: boolean) => void
  setToolEnabled: (id: ChatToolId, enabled: boolean) => void
  addMcpServer: (input: {
    name: string
    transport: McpServerTransport
    url: string
    headers: Omit<McpServerHeader, "id">[]
  }) => McpServerConfig
  updateMcpServer: (
    id: string,
    patch: Partial<
      Pick<McpServerConfig, "name" | "transport" | "url" | "headers">
    >,
  ) => void
  removeMcpServer: (id: string) => void
  setMcpServerEnabled: (id: string, enabled: boolean) => void
  setMcpServerTestResult: (id: string, result: McpServerTestResult) => void
  setIncludeThreadTitle: (value: boolean) => void
  setChatPreference: (
    key:
      | "showTimestamps"
      | "compactMessages"
      | "autoScroll"
      | "wrapCode"
      | "showReasoning"
      | "showToolCalls"
      | "contextAlertEnabled",
    value: boolean,
  ) => void
  setContextThreshold: (
    key: "contextCompactThreshold" | "contextNewThreshold",
    value: number,
  ) => void
  getEnabledToolIds: () => ChatToolId[]
  getEnabledMcpServers: () => McpServerRequestConfig[]
}

export const useChatToolsStore = create<ChatToolsState>()(
  persist(
    (set, get) => ({
      enabled: buildDefaultEnabled(),
      mcpServers: [],
      includeThreadTitle: false,
      showTimestamps: true,
      compactMessages: false,
      autoScroll: true,
      wrapCode: true,
      showReasoning: true,
      showToolCalls: true,
      contextAlertEnabled: true,
      contextCompactThreshold: 70,
      contextNewThreshold: 90,
      mechanicMode: false,
      setMechanicMode: (value) => set({ mechanicMode: value }),
      setToolEnabled: (id, enabled) =>
        set((state) => ({
          enabled: { ...state.enabled, [id]: enabled },
        })),
      addMcpServer: (input) => {
        const now = new Date().toISOString()
        const server: McpServerConfig = {
          id: crypto.randomUUID(),
          name: input.name.trim(),
          transport: input.transport,
          url: input.url.trim(),
          enabled: true,
          headers: input.headers
            .filter((header) => header.name.trim() && header.value.trim())
            .map((header) => ({
              id: crypto.randomUUID(),
              name: header.name.trim(),
              value: header.value.trim(),
            })),
          createdAt: now,
          updatedAt: now,
        }

        set((state) => ({
          mcpServers: [...state.mcpServers, server],
        }))

        return server
      },
      updateMcpServer: (id, patch) =>
        set((state) => ({
          mcpServers: state.mcpServers.map((server) =>
            server.id === id
              ? {
                  ...server,
                  ...patch,
                  name: patch.name?.trim() ?? server.name,
                  url: patch.url?.trim() ?? server.url,
                  updatedAt: new Date().toISOString(),
                }
              : server,
          ),
        })),
      removeMcpServer: (id) =>
        set((state) => ({
          mcpServers: state.mcpServers.filter((server) => server.id !== id),
        })),
      setMcpServerEnabled: (id, enabled) =>
        set((state) => ({
          mcpServers: state.mcpServers.map((server) =>
            server.id === id
              ? { ...server, enabled, updatedAt: new Date().toISOString() }
              : server,
          ),
        })),
      setMcpServerTestResult: (id, result) =>
        set((state) => ({
          mcpServers: state.mcpServers.map((server) =>
            server.id === id
              ? {
                  ...server,
                  lastTest: result,
                  updatedAt: new Date().toISOString(),
                }
              : server,
          ),
        })),
      setIncludeThreadTitle: (value) => set({ includeThreadTitle: value }),
      setChatPreference: (key, value) => set({ [key]: value }),
      setContextThreshold: (key, value) =>
        set({ [key]: Math.min(100, Math.max(1, Math.round(value))) }),
      getEnabledToolIds: () =>
        CHAT_TOOLS.filter((tool) => get().enabled[tool.id]).map(
          (tool) => tool.id,
        ),
      getEnabledMcpServers: () =>
        get()
          .mcpServers.filter((server) => server.enabled)
          .map(toMcpServerRequestConfig),
    }),
    {
      name: "v1-xulux-chat-tools",
      // Default shallow merge would replace the whole `enabled` object with the
      // persisted one, leaving tools added after first persist (e.g. "canvas")
      // undefined — i.e. silently disabled. Re-seed defaults for new tool ids.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ChatToolsState> | undefined
        return {
          ...currentState,
          ...persisted,
          enabled: { ...buildDefaultEnabled(), ...(persisted?.enabled ?? {}) },
        }
      },
    },
  ),
)
