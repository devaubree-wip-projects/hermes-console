"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ActivityIcon } from "lucide-react"
import { presentEvent, type EventTone } from "@/lib/events/presentation"
import { cn } from "@/lib/utils"

type EventLog = {
  id: string
  action: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

const toneDot: Record<EventTone, string> = {
  neutral: "bg-muted-foreground/60",
  info: "bg-sky-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-destructive",
}

export function EventLogsCard({ workspaceBase }: { workspaceBase: string }) {
  const [latest, setLatest] = useState<EventLog | null>(null)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api${workspaceBase}/events?limit=1`, {
        cache: "no-store",
        signal,
      })
      if (!response.ok) throw new Error(`Event Logs ${response.status}`)
      const payload = await response.json() as { events?: EventLog[] }
      setLatest(payload.events?.[0] ?? null)
      setLoaded(true)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setLoaded(true)
    }
  }, [workspaceBase])

  useEffect(() => {
    const controller = new AbortController()
    const refreshCurrent = () => {
      if (document.visibilityState === "visible") void refresh(controller.signal)
    }
    const refreshAfterEvent = () => void refresh(controller.signal)
    const initialRefresh = window.setTimeout(() => void refresh(controller.signal), 0)
    window.addEventListener("focus", refreshCurrent)
    window.addEventListener("hermes:event-log", refreshAfterEvent)
    document.addEventListener("visibilitychange", refreshCurrent)
    return () => {
      controller.abort()
      window.clearTimeout(initialRefresh)
      window.removeEventListener("focus", refreshCurrent)
      window.removeEventListener("hermes:event-log", refreshAfterEvent)
      document.removeEventListener("visibilitychange", refreshCurrent)
    }
  }, [refresh])

  const event = latest ? presentEvent(latest.action, latest.metadata) : null
  const time = latest
    ? new Date(latest.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : null

  return (
    <Link
      aria-label={event ? `Event Logs, ${event.label}` : "Event Logs"}
      className={cn(
        "flex min-h-12 items-center gap-2.5 rounded-xl border border-sidebar-border bg-sidebar-accent/35 px-2.5 py-2",
        "text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:min-h-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:p-0",
      )}
      href={`${workspaceBase}/events`}
      title="Event Logs"
    >
      <span className="relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <ActivityIcon className="size-3.5" />
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-sidebar",
            event ? toneDot[event.tone] : "bg-muted-foreground/40",
          )}
        />
      </span>
      <span className="min-w-0 flex-1 group-data-[collapsible=icon]:sr-only">
        <span className="block text-xs font-medium">Event Logs</span>
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
          {!loaded ? "Chargement…" : event ? `${event.label} · ${time}` : "Aucun événement"}
        </span>
      </span>
    </Link>
  )
}
