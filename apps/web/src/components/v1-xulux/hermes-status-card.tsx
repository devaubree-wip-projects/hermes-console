"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { PlugIcon } from "lucide-react"
import type { WorkspaceAgentOption } from "@/components/v1-xulux/app-sidebar"
import { cn } from "@/lib/utils"

type RuntimeSnapshot = {
  agentSlug: string
  connected: boolean
  installationName: string | null
  hermesVersion: string | null
}

export function HermesStatusCard({
  agent,
  workspaceBase,
}: {
  agent?: WorkspaceAgentOption
  workspaceBase: string
}) {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null)
  const endpoint = agent
    ? `/api${workspaceBase}/agents/${encodeURIComponent(agent.slug)}/runtime-status`
    : null
  const current = snapshot?.agentSlug === agent?.slug ? snapshot : null
  const state = !agent ? "unconfigured" : !current ? "checking" : current.connected ? "connected" : "offline"
  const installationName = current?.installationName ?? agent?.installationName
  const version = current?.hermesVersion ?? agent?.hermesVersion
  const title = state === "connected"
    ? "Hermes connecté"
    : state === "checking"
      ? "Vérification Hermes…"
      : state === "offline"
        ? "Hermes hors ligne"
        : "Hermes non configuré"
  const detail = state === "connected"
    ? [installationName, version ? `v${version.replace(/^v/, "")}` : null].filter(Boolean).join(" · ")
    : state === "checking"
      ? installationName ?? "Connexion au runtime"
      : state === "offline"
        ? installationName ?? "Runtime indisponible"
        : "Ajoutez un agent"

  useEffect(() => {
    if (!endpoint || !agent) return
    const controller = new AbortController()

    const refresh = async () => {
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Runtime status ${response.status}`)
        const result = await response.json() as Omit<RuntimeSnapshot, "agentSlug">
        setSnapshot({ agentSlug: agent.slug, ...result })
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setSnapshot({
          agentSlug: agent.slug,
          connected: false,
          installationName: agent.installationName,
          hermesVersion: agent.hermesVersion,
        })
      }
    }

    void refresh()
    const interval = window.setInterval(() => void refresh(), 30_000)
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    window.addEventListener("focus", refreshWhenVisible)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    return () => {
      controller.abort()
      window.clearInterval(interval)
      window.removeEventListener("focus", refreshWhenVisible)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [agent, endpoint])

  return (
    <Link
      aria-label={`${title}${detail ? `, ${detail}` : ""}`}
      className={cn(
        "flex min-h-12 items-center gap-2.5 rounded-xl border border-sidebar-border bg-sidebar-accent/35 px-2.5 py-2",
        "text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:min-h-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:p-0",
      )}
      href={`${workspaceBase}/installations`}
      title={title}
    >
      <span
        className={cn(
          "relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
          state === "connected" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
          state === "offline" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        )}
      >
        <PlugIcon className="size-3.5" />
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-sidebar",
            state === "connected" && "bg-emerald-500",
            state === "checking" && "animate-pulse bg-amber-500",
            state === "offline" && "bg-amber-500",
            state === "unconfigured" && "bg-muted-foreground/50",
          )}
        />
      </span>
      <span
        aria-live="polite"
        className="min-w-0 flex-1 group-data-[collapsible=icon]:sr-only"
        role="status"
      >
        <span className="block truncate text-xs font-medium">{title}</span>
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{detail}</span>
      </span>
    </Link>
  )
}
