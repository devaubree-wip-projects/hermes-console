"use client"

import { useAuiState, type ToolCallMessagePart } from "@assistant-ui/react"

export type CanvasDocument = {
  toolCallId: string
  title: string | undefined
  content: string | undefined
  isComplete: boolean
}

/**
 * Derives a canvas document from the current thread: the `canvas` tool call
 * matching `toolCallId` (or the last one when omitted), with args
 * incrementally parsed while the model streams them.
 * Pattern from the official assistant-ui `with-artifacts` example.
 */
export function useCanvasDocument(toolCallId?: string): CanvasDocument | null {
  const call = useAuiState((s) => {
    const calls = s.thread.messages.flatMap((m) =>
      m.content.filter(
        (part): part is ToolCallMessagePart =>
          part.type === "tool-call" && part.toolName === "canvas",
      ),
    )
    return toolCallId
      ? calls.find((c) => c.toolCallId === toolCallId)
      : calls.at(-1)
  })

  if (!call) return null

  const { args } = call
  return {
    toolCallId: call.toolCallId,
    title: typeof args?.title === "string" ? args.title : undefined,
    content: typeof args?.content === "string" ? args.content : undefined,
    isComplete: call.result !== undefined,
  }
}
