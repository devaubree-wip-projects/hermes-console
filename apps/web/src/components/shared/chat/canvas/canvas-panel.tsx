"use client"

import { useEffect, useRef, useState } from "react"
import { useAuiState } from "@assistant-ui/react"
import { SquarePenIcon, XIcon } from "lucide-react"

import { Button } from "@/components/shared/chat/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/shared/chat/ui/sheet"
import { useCanvasStore } from "@/lib/shared/chat/canvas-store"
import { CanvasMarkdown } from "./canvas-markdown"
import {
  useCanvasDocument,
  type CanvasDocument,
} from "./use-canvas-document"

// Side-by-side layout only makes sense from tablet landscape up; below that
// the canvas takes over the whole viewport as a sheet.
const DESKTOP_BREAKPOINT = 1024

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`)
    const onChange = () => {
      setIsDesktop(mql.matches)
    }
    mql.addEventListener("change", onChange)
    setIsDesktop(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isDesktop
}

function CanvasHeader({
  title,
  onClose,
}: {
  title: string
  onClose: () => void
}) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
      <div className="flex min-w-0 items-center gap-2">
        <SquarePenIcon className="text-muted-foreground size-4 shrink-0" />
        <span className="truncate text-sm font-medium">{title}</span>
      </div>
      <div className="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          onClick={onClose}
          aria-label="Close canvas"
        >
          <XIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function CanvasContent({
  doc,
  onClose,
}: {
  doc: CanvasDocument
  onClose: () => void
}) {
  const draft = useCanvasStore((s) => s.drafts[doc.toolCallId])
  const text = draft ?? doc.content ?? ""

  return (
    <>
      <CanvasHeader title={doc.title ?? "Canvas"} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <CanvasMarkdown text={text} isRunning={!doc.isComplete} />
      </div>
    </>
  )
}

export function CanvasPanel() {
  const openCallId = useCanvasStore((s) => s.openCallId)
  const open = useCanvasStore((s) => s.open)
  const close = useCanvasStore((s) => s.close)
  const lastDoc = useCanvasDocument()
  const doc = useCanvasDocument(openCallId ?? undefined)
  const isRunning = useAuiState((s) => s.thread.isRunning)
  const mainThreadId = useAuiState((s) => s.threads.mainThreadId)
  const isDesktop = useIsDesktop()

  // Arriving on a conversation never auto-opens its historical canvases:
  // the panel resets on every thread switch and only reappears through an
  // explicit open (inline card button) or a live-streamed call below.
  useEffect(() => {
    close()
  }, [mainThreadId, close])

  // Auto-open only when a NEW canvas call appears while the thread is
  // running (the model is writing it live) — not when history loads.
  const lastCallId = lastDoc?.toolCallId
  const prevCallId = useRef(lastCallId)
  useEffect(() => {
    if (lastCallId && lastCallId !== prevCallId.current && isRunning) {
      open(lastCallId)
    }
    prevCallId.current = lastCallId
  }, [lastCallId, isRunning, open])

  if (!openCallId || !doc || isDesktop === undefined) {
    return null
  }

  if (!isDesktop) {
    return (
      <Sheet open onOpenChange={(open) => !open && close()}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full gap-0 p-0 sm:max-w-none"
        >
          <SheetTitle className="sr-only">Canvas</SheetTitle>
          <CanvasContent key={doc.toolCallId} doc={doc} onClose={close} />
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <aside
      aria-label="Canvas"
      className="bg-background motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:fade-in motion-safe:duration-300 flex h-full min-h-0 w-[clamp(20rem,42%,44rem)] shrink-0 flex-col border-s"
    >
      <CanvasContent key={doc.toolCallId} doc={doc} onClose={close} />
    </aside>
  )
}
