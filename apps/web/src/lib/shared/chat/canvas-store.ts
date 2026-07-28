"use client"

import { create } from "zustand"

// UI-only state: the canvas document itself is derived from the thread's
// `canvas` tool calls (see use-canvas-document.ts) — the thread is the
// source of truth. The panel is closed by default; it only opens explicitly
// (the "open in canvas" button) or when a canvas call streams live.
type CanvasState = {
  openCallId: string | null
  drafts: Record<string, string>
  open: (toolCallId: string) => void
  close: () => void
  setDraft: (toolCallId: string, text: string) => void
}

export const useCanvasStore = create<CanvasState>((set) => ({
  openCallId: null,
  drafts: {},
  open: (toolCallId) => set({ openCallId: toolCallId }),
  close: () => set({ openCallId: null }),
  setDraft: (toolCallId, text) =>
    set((state) => ({ drafts: { ...state.drafts, [toolCallId]: text } })),
}))
