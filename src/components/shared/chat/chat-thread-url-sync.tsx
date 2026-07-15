"use client"

import { useAui, useAuiState } from "@assistant-ui/react"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef } from "react"
import { useChatRoutes } from "@/components/shared/chat/chat-routes-context"

export function ChatThreadUrlSync({ threadId }: { threadId?: string }) {
  const pathname = usePathname()
  const aui = useAui()
  const {
    base: v1ChatBase,
    baseWithAgent: v1ChatBaseWithAgent,
    threadUrl: v1ChatThreadUrl,
  } = useChatRoutes()
  const syncingFromUrl = useRef(false)
  const initializedNewThread = useRef(false)
  const mainThreadId = useAuiState((s) => s.threads.mainThreadId)
  const mainRemoteId = useAuiState((s) =>
    s.threads.threadItems.find((item) => item.id === s.threads.mainThreadId)?.remoteId,
  )
  const threadsLoading = useAuiState((s) => s.threads.isLoading)
  const pathnameRef = useRef(pathname)

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  const currentPathname = useCallback(
    () =>
      typeof window === "undefined"
        ? pathnameRef.current
        : window.location.pathname,
    [],
  )

  const replaceBaseUrl = useCallback(() => {
    if (currentPathname() !== v1ChatBase && currentPathname() !== v1ChatBaseWithAgent) {
      window.history.replaceState(null, "", v1ChatBaseWithAgent)
    }
  }, [currentPathname, v1ChatBase, v1ChatBaseWithAgent])

  const replaceThreadUrl = useCallback((id: string) => {
    const target = v1ChatThreadUrl(id)
    if (currentPathname() !== target) {
      window.history.replaceState(null, "", target)
    }
  }, [currentPathname, v1ChatThreadUrl])

  const endUrlSync = useCallback(() => {
    syncingFromUrl.current = false
  }, [])

  // /d/chat without id → fresh new-thread state (stay on /d/chat until a message)
  // The runtime now stays mounted across navigations (no remount), so this ref
  // must be re-armed whenever we land on a concrete thread, otherwise returning
  // to /d/chat later would never start a fresh new thread.
  useEffect(() => {
    if (threadId) {
      initializedNewThread.current = false
      return
    }
    if (initializedNewThread.current) return
    initializedNewThread.current = true
    syncingFromUrl.current = true
    try {
      aui.threads().switchToNewThread()
    } finally {
      endUrlSync()
    }
  }, [threadId, aui, endUrlSync])

  // URL → runtime: deep link /c/:id
  useEffect(() => {
    if (!threadId) return
    if (threadId === mainThreadId) return
    if (threadsLoading) return

    let cancelled = false
    syncingFromUrl.current = true
    // switchToThread is async: an unknown/deleted id triggers adapter.fetch()
    // which rejects with a 404. Await it so the rejection is handled here
    // (a synchronous try/catch never sees it) and fall back to a fresh thread.
    void (async () => {
      try {
        await aui.threads().switchToThread(threadId)
      } catch {
        if (cancelled) return
        aui.threads().switchToNewThread()
        replaceBaseUrl()
      } finally {
        if (!cancelled) endUrlSync()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    threadId,
    mainThreadId,
    threadsLoading,
    aui,
    replaceBaseUrl,
    endUrlSync,
  ])

  // runtime → URL: wait for Hermes to return the durable stored session id.
  // Routing the optimistic assistant-ui __LOCALID would produce an invalid
  // deep link after refresh.
  useEffect(() => {
    if (!mainRemoteId || syncingFromUrl.current) return
    if (currentPathname() !== v1ChatBase) return
    replaceThreadUrl(mainRemoteId)
  }, [currentPathname, mainRemoteId, replaceThreadUrl, v1ChatBase])

  return null
}
