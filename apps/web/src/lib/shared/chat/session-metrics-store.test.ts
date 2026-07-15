import { beforeEach, describe, expect, test } from "bun:test";
import { useSessionMetricsStore } from "@/lib/shared/chat/session-metrics-store";

describe("session metrics live store", () => {
  beforeEach(() => useSessionMetricsStore.setState({ sessions: {}, invalidations: {} }));

  test("publishes an exact live context keyed by stored session", () => {
    useSessionMetricsStore.getState().publishInfo("session-1", {
      model: "gpt-5.6-luna",
      provider: "openai-codex",
      reasoning_effort: "low",
      usage: {
        context_used: 70_587,
        context_max: 272_000,
        context_percent: 26,
      },
    });

    expect(useSessionMetricsStore.getState().sessions["session-1"]).toMatchObject({
      model: "gpt-5.6-luna",
      reasoningEffort: "low",
      context: {
        usedTokens: 70_587,
        maxTokens: 272_000,
        remainingTokens: 201_413,
      },
      persistedContext: null,
    });
  });

  test("clears the live gauge instead of fabricating context", () => {
    const store = useSessionMetricsStore.getState();
    store.publishInfo("session-1", {
      usage: { context_used: 70_587, context_max: 272_000 },
    });
    useSessionMetricsStore.getState().publishInfo("session-1", {
      model: "gpt-5.6-luna",
      usage: { context_max: 272_000 },
    });

    expect(useSessionMetricsStore.getState().sessions["session-1"]?.context).toBeNull();
  });

  test("keeps the validated persisted context available when live usage is absent", () => {
    useSessionMetricsStore.getState().publishPersisted({
      sessionId: "session-1",
      source: "telegram",
      model: "gpt-5.6-luna",
      provider: "openai-codex",
      reasoningEffort: "low",
      usage: {
        processedTokens: 420_194,
        inputTokens: 121_446,
        cacheReadTokens: 296_448,
        cacheWriteTokens: 0,
        outputTokens: 2_300,
        reasoningTokens: 351,
        apiCalls: 12,
      },
      context: {
        usedTokens: 70_587,
        maxTokens: 272_000,
        remainingTokens: 201_413,
        percent: 25.951,
        measuredAt: "2026-07-15T01:01:23.337Z",
        measurement: "provider",
      },
    });
    useSessionMetricsStore.getState().publishInfo("session-1", {
      model: "gpt-5.6-luna",
      usage: {},
    });

    expect(useSessionMetricsStore.getState().sessions["session-1"]).toMatchObject({
      context: null,
      persistedContext: {
        usedTokens: 70_587,
        maxTokens: 272_000,
      },
    });
  });

  test("publishes an event revision without polling", () => {
    const store = useSessionMetricsStore.getState();
    store.invalidate("session-1");
    useSessionMetricsStore.getState().invalidate("session-1");

    expect(useSessionMetricsStore.getState().invalidations["session-1"]).toBe(2);
  });

  test("publishes a clearly typed local estimate when provider context is absent", () => {
    useSessionMetricsStore.getState().publishContextBreakdown("session-1", {
      context_used: 33_700,
      context_max: 128_000,
      estimated_total: 33_700,
      model: "gpt-5.6-luna",
    });

    expect(useSessionMetricsStore.getState().sessions["session-1"]).toMatchObject({
      model: "gpt-5.6-luna",
      context: null,
      persistedContext: null,
      estimatedContext: {
        usedTokens: 33_700,
        maxTokens: 128_000,
        remainingTokens: 94_300,
        measurement: "estimated",
      },
    });
  });
});
