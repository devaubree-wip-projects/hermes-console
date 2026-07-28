"use client";

import { create } from "zustand";
import type { SessionContextBreakdown, SessionInfo } from "@/lib/hermes/protocol";
import type { SessionMetricsResponse } from "@/lib/hermes/session-metrics";

type ExactContext = NonNullable<SessionMetricsResponse["context"]>;

export type LiveSessionMetrics = {
  model: string | null;
  provider: string | null;
  reasoningEffort: string | null;
  context: ExactContext | null;
  persistedContext: ExactContext | null;
  estimatedContext: ExactContext | null;
};

type SessionMetricsState = {
  sessions: Record<string, LiveSessionMetrics>;
  invalidations: Record<string, number>;
  publishInfo: (sessionId: string, info: SessionInfo) => void;
  publishPersisted: (metrics: SessionMetricsResponse) => void;
  publishContextBreakdown: (sessionId: string, breakdown: SessionContextBreakdown) => void;
  invalidate: (sessionId: string) => void;
  remove: (sessionId: string) => void;
};

function exactContext(info: SessionInfo): LiveSessionMetrics["context"] {
  const usedTokens = info.usage?.context_used;
  const maxTokens = info.usage?.context_max;
  if (
    typeof usedTokens !== "number"
    || !Number.isFinite(usedTokens)
    || usedTokens <= 0
    || typeof maxTokens !== "number"
    || !Number.isFinite(maxTokens)
    || maxTokens <= 0
  ) {
    return null;
  }
  const used = Math.max(0, Math.trunc(usedTokens));
  const max = Math.max(0, Math.trunc(maxTokens));
  return {
    usedTokens: used,
    maxTokens: max,
    remainingTokens: Math.max(0, max - used),
    percent: Math.max(0, Math.min(100, used / max * 100)),
    measuredAt: new Date().toISOString(),
    measurement: "provider",
  };
}

function estimatedContext(breakdown: SessionContextBreakdown): ExactContext | null {
  const usedTokens = breakdown.estimated_total;
  const maxTokens = breakdown.context_max;
  if (
    typeof usedTokens !== "number"
    || !Number.isFinite(usedTokens)
    || usedTokens <= 0
    || typeof maxTokens !== "number"
    || !Number.isFinite(maxTokens)
    || maxTokens <= 0
  ) {
    return null;
  }
  const used = Math.max(0, Math.trunc(usedTokens));
  const max = Math.max(0, Math.trunc(maxTokens));
  return {
    usedTokens: used,
    maxTokens: max,
    remainingTokens: Math.max(0, max - used),
    percent: Math.max(0, Math.min(100, used / max * 100)),
    measuredAt: new Date().toISOString(),
    measurement: "estimated",
  };
}

export const useSessionMetricsStore = create<SessionMetricsState>((set) => ({
  sessions: {},
  invalidations: {},
  publishInfo: (sessionId, info) => set((state) => ({
    sessions: {
      ...state.sessions,
      [sessionId]: {
        model: typeof info.model === "string" && info.model ? info.model : null,
        provider: typeof info.provider === "string" && info.provider ? info.provider : null,
        reasoningEffort: typeof info.reasoning_effort === "string" && info.reasoning_effort
          ? info.reasoning_effort
          : null,
        context: exactContext(info),
        persistedContext: state.sessions[sessionId]?.persistedContext ?? null,
        estimatedContext: state.sessions[sessionId]?.estimatedContext ?? null,
      },
    },
  })),
  publishPersisted: (metrics) => set((state) => {
    const current = state.sessions[metrics.sessionId];
    return {
      sessions: {
        ...state.sessions,
        [metrics.sessionId]: {
          model: current?.model ?? metrics.model,
          provider: current?.provider ?? metrics.provider,
          reasoningEffort: current?.reasoningEffort ?? metrics.reasoningEffort,
          context: current?.context ?? null,
          persistedContext: metrics.context,
          estimatedContext: current?.estimatedContext ?? null,
        },
      },
    };
  }),
  publishContextBreakdown: (sessionId, breakdown) => set((state) => {
    const current = state.sessions[sessionId];
    return {
      sessions: {
        ...state.sessions,
        [sessionId]: {
          model: current?.model ?? (breakdown.model || null),
          provider: current?.provider ?? null,
          reasoningEffort: current?.reasoningEffort ?? null,
          context: current?.context ?? null,
          persistedContext: current?.persistedContext ?? null,
          estimatedContext: estimatedContext(breakdown),
        },
      },
    };
  }),
  invalidate: (sessionId) => set((state) => ({
    invalidations: {
      ...state.invalidations,
      [sessionId]: (state.invalidations[sessionId] ?? 0) + 1,
    },
  })),
  remove: (sessionId) => set((state) => {
    const sessions = { ...state.sessions };
    const invalidations = { ...state.invalidations };
    delete sessions[sessionId];
    delete invalidations[sessionId];
    return { sessions, invalidations };
  }),
}));
