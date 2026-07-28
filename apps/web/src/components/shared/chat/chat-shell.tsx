"use client"

import { Base } from "@/components/shared/chat/examples/base"
import { CanvasPanel } from "@/components/shared/chat/canvas/canvas-panel"

export function XuluxChatShell() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-row overflow-hidden">
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <Base />
      </div>
      <CanvasPanel />
    </div>
  )
}
