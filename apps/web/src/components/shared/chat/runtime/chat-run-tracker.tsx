"use client"

import { useAui, useAuiEvent, useAuiState } from "@assistant-ui/react"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import { useChatRoutes } from "@/components/shared/chat/chat-routes-context"
import { useChatRunStore } from "@/lib/shared/chat/chat-run-store"

const RUN_SETTLE_MS = 3_000

function threadIdFromPathname(pathname: string) {
  const match = pathname.match(/\/d\/chat\/c\/([^/]+)$/)
  return match?.[1]
}

function isViewingThread(
  pathname: string,
  base: string,
  mainThreadId: string,
  threadId: string,
) {
  if (!pathname.startsWith(base)) return false
  const urlThreadId = threadIdFromPathname(pathname)
  if (urlThreadId) return urlThreadId === threadId
  return pathname === base && mainThreadId === threadId
}

export function ChatRunTracker() {
  const aui = useAui()
  const { base, threadUrl } = useChatRoutes()
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  const markRunning = useChatRunStore((s) => s.markRunning)
  const markIdle = useChatRunStore((s) => s.markIdle)
  const settleTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  )
  const runningIdsRef = useRef(new Set<string>())
  const mainThreadId = useAuiState((s) => s.threads.mainThreadId)
  const isRunning = useAuiState((s) => s.thread.isRunning)

  const markThreadRunning = useCallback(
    (threadId: string) => {
      const pending = settleTimersRef.current.get(threadId)
      if (pending) {
        clearTimeout(pending)
        settleTimersRef.current.delete(threadId)
      }
      runningIdsRef.current.add(threadId)
      markRunning(threadId)
    },
    [markRunning],
  )

  const markThreadIdle = useCallback(
    (threadId: string) => {
      runningIdsRef.current.delete(threadId)
      markIdle(threadId)
    },
    [markIdle],
  )

  const scheduleThreadIdle = useCallback(
    (threadId: string) => {
      const pending = settleTimersRef.current.get(threadId)
      if (pending) clearTimeout(pending)

      markThreadIdle(threadId)

      settleTimersRef.current.set(
        threadId,
        setTimeout(() => {
          settleTimersRef.current.delete(threadId)

          const { mainThreadId, threadItems } = aui.threads().getState()
          if (isViewingThread(pathnameRef.current, base, mainThreadId, threadId)) {
            return
          }
          const title =
            threadItems.find((item) => item.id === threadId)?.title ??
            "Conversation"
          toast("Réponse prête", {
            description: title,
            action: {
              label: "Ouvrir",
              onClick: () => {
                window.location.href = threadUrl(threadId)
              },
            },
          })
        }, RUN_SETTLE_MS),
      )
    },
    [aui, markThreadIdle, base, threadUrl],
  )

  useEffect(() => {
    return () => {
      const timers = settleTimersRef.current
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()

      for (const threadId of runningIdsRef.current) {
        markIdle(threadId)
      }
      runningIdsRef.current.clear()
    }
  }, [markIdle])

  useEffect(() => {
    if (!mainThreadId) return
    if (isRunning) {
      markThreadRunning(mainThreadId)
      return
    }
    if (runningIdsRef.current.has(mainThreadId)) {
      scheduleThreadIdle(mainThreadId)
    }
  }, [mainThreadId, isRunning, markThreadRunning, scheduleThreadIdle])

  useAuiEvent("thread.runStart", ({ threadId }) => {
    markThreadRunning(threadId)
  })

  useAuiEvent("thread.runEnd", ({ threadId }) => {
    scheduleThreadIdle(threadId)
  })

  return null
}
