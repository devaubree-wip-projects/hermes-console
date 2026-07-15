"use client"

import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useShallow } from "zustand/shallow"
import { useThreadContextUsage } from "@/components/shared/chat/assistant-ui/context-usage-indicator"
import type { ModelId } from "@/components/shared/chat/constants/model"
import { useChatRoutes } from "@/components/shared/chat/chat-routes-context"
import { useChatToolsStore } from "@/lib/shared/chat/chat-tools-store"
import { appendAgentQuery } from "@/lib/chat-agent-context"
import { useAui, useAuiState } from "@assistant-ui/react"

/**
 * Watches the current thread's context usage and, once per thread per level,
 * surfaces a toast when it crosses the user-configured thresholds — offering to
 * compact the conversation or start a fresh one. Mounted inside the composer so
 * it has the active model id (which sets the context window).
 */
function resolveApiBaseFromParams(
  params: Record<string, string | string[]>,
  apiBase?: string,
): string {
  if (apiBase) return apiBase
  const tenantSlug =
    typeof params.tenantSlug === "string"
      ? params.tenantSlug
      : Array.isArray(params.tenantSlug)
        ? params.tenantSlug[0]
        : undefined
  const workspaceSlug =
    typeof params.workspaceSlug === "string"
      ? params.workspaceSlug
      : Array.isArray(params.workspaceSlug)
        ? params.workspaceSlug[0]
        : undefined

  if (!tenantSlug || !workspaceSlug) {
    return "/api"
  }

  return `/api/${tenantSlug}/${workspaceSlug}`
}

export function ContextAlertWatcher({
  modelId,
  apiBase,
}: {
  modelId: ModelId
  apiBase?: string
}) {
  const router = useRouter()
  const aui = useAui()
  const params = useParams() as Record<string, string | string[]>
  const compactApiBase = resolveApiBaseFromParams(params, apiBase)
  const {
    baseWithAgent: v1ChatBaseWithAgent,
    threadUrl: v1ChatThreadUrl,
    activeAgentId,
  } = useChatRoutes()
  const mainThreadId = useAuiState((s) => s.threads.mainThreadId)
  const { percent } = useThreadContextUsage(modelId)
  const [compacting, setCompacting] = useState(false)

  const { enabled, compactAt, newAt } = useChatToolsStore(
    useShallow((s) => ({
      enabled: s.contextAlertEnabled,
      compactAt: s.contextCompactThreshold,
      newAt: s.contextNewThreshold,
    })),
  )

  // Remember which (thread, level) alerts already fired so a growing context
  // doesn't re-toast on every streamed token.
  const alerted = useRef<Set<string>>(new Set())

  const startNewConversation = useCallback(() => {
    aui.threads().switchToNewThread()
    router.push(v1ChatBaseWithAgent, { scroll: false })
  }, [aui, router, v1ChatBaseWithAgent])

  const compact = useCallback(
    async (threadId: string) => {
      setCompacting(true)
      const toastId = toast.loading("Compactage de la conversation…")
      try {
        const res = await fetch(
          appendAgentQuery(
            `${compactApiBase}/threads/${threadId}/compact`,
            activeAgentId,
          ),
          { method: "POST", headers: { "content-type": "application/json" } },
        )
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as {
          summarized?: number
          kept?: number
        }
        if (!data.summarized) {
          toast.info("Conversation déjà assez courte — rien à compacter.", { id: toastId })
          setCompacting(false)
          return
        }
        toast.success(
          `Conversation compactée — ${data.summarized} messages résumés`,
          { id: toastId },
        )
        // Full reload so the history adapter re-fetches the rewritten thread.
        window.location.assign(v1ChatThreadUrl(threadId))
      } catch {
        toast.error("Le compactage a échoué.", { id: toastId })
        setCompacting(false)
      }
    },
    [compactApiBase, activeAgentId, v1ChatThreadUrl],
  )

  useEffect(() => {
    if (!enabled || compacting) return
    if (!mainThreadId) return

    const pct = percent * 100
    const newKey = `${mainThreadId}:new`
    const compactKey = `${mainThreadId}:compact`

    if (pct >= newAt && !alerted.current.has(newKey)) {
      alerted.current.add(newKey)
      alerted.current.add(compactKey)
      toast.warning(`Contexte à ${pct.toFixed(0)}%`, {
        description:
          "La fenêtre de contexte est presque pleine. Compacte la conversation ou démarres-en une nouvelle.",
        duration: 20_000,
        action: {
          label: "Nouvelle conversation",
          onClick: startNewConversation,
        },
        cancel: {
          label: "Compacter",
          onClick: () => compact(mainThreadId),
        },
      })
      return
    }

    if (pct >= compactAt && !alerted.current.has(compactKey)) {
      alerted.current.add(compactKey)
      toast(`Contexte à ${pct.toFixed(0)}%`, {
        description:
          "Pense à compacter la conversation pour libérer du contexte.",
        duration: 15_000,
        action: {
          label: "Compacter",
          onClick: () => compact(mainThreadId),
        },
        cancel: {
          label: "Nouvelle conversation",
          onClick: startNewConversation,
        },
      })
    }
  }, [
    percent,
    mainThreadId,
    enabled,
    compactAt,
    newAt,
    compacting,
    compact,
    startNewConversation,
  ])

  return null
}
