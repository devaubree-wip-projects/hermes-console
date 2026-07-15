"use client"

import { makeAssistantToolUI } from "@assistant-ui/react"
import { Loader2Icon, SquarePenIcon } from "lucide-react"

import { Button } from "@/components/shared/chat/ui/button"
import { useCanvasStore } from "@/lib/shared/chat/canvas-store"

type CanvasArgs = { title?: string; content?: string }
type CanvasResult = { ok?: boolean; title?: string; chars?: number }

// Pure inline card — the side panel derives its own state from the thread
// (use-canvas-document.ts); this UI never mutates anything during streaming.
export const CanvasToolUI = makeAssistantToolUI<CanvasArgs, CanvasResult>({
  toolName: "canvas",
  // Render outside the collapsible tool group ("N tool calls") so the card —
  // and its reopen button — stay visible in the thread, like an artifact.
  display: "standalone",
  render: ({ toolCallId, args, status }) => {
    const running = status.type === "running"
    const title = typeof args?.title === "string" ? args.title : undefined

    return (
      <div className="my-1.5 flex w-full items-center gap-2 overflow-hidden rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
        {running ? (
          <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <SquarePenIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate">
          <span className="text-muted-foreground">
            {running ? "Écriture dans le canvas · " : "Canvas · "}
          </span>
          <span className="font-medium">{title ?? "…"}</span>
        </span>
        {!running ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 px-2 text-xs"
            onClick={() => useCanvasStore.getState().open(toolCallId)}
          >
            Ouvrir dans le canvas
          </Button>
        ) : null}
      </div>
    )
  },
})
