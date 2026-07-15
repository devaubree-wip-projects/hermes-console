"use client"

import { create } from "zustand"

type ChatRunState = {
  runningThreadIds: string[]
  markRunning: (threadId: string) => void
  markIdle: (threadId: string) => void
  isThreadRunning: (threadId: string) => boolean
  hasRunning: () => boolean
}

export const useChatRunStore = create<ChatRunState>((set, get) => ({
  runningThreadIds: [],
  markRunning: (threadId) =>
    set((state) => {
      if (state.runningThreadIds.includes(threadId)) return state
      return { runningThreadIds: [...state.runningThreadIds, threadId] }
    }),
  markIdle: (threadId) =>
    set((state) => ({
      runningThreadIds: state.runningThreadIds.filter((id) => id !== threadId),
    })),
  isThreadRunning: (threadId) => get().runningThreadIds.includes(threadId),
  hasRunning: () => get().runningThreadIds.length > 0,
}))
