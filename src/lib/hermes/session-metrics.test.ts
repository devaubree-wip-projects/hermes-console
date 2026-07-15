import { describe, expect, test } from "bun:test";
import {
  buildSessionMetrics,
  processedTokenCount,
} from "@/lib/hermes/session-metrics";

const row = {
  id: "session-1",
  source: "telegram",
  model: "gpt-5.6-luna",
  billing_provider: "openai-codex",
  input_tokens: 121_446,
  output_tokens: 2_300,
  cache_read_tokens: 296_448,
  cache_write_tokens: 0,
  reasoning_tokens: 351,
  api_call_count: 12,
  model_config: JSON.stringify({
    reasoning_config: { enabled: true, effort: "low" },
  }),
};

describe("session metrics", () => {
  test("counts canonical processed tokens without adding reasoning twice", () => {
    expect(processedTokenCount(row)).toBe(420_194);
    expect(buildSessionMetrics({ row }).usage).toEqual({
      processedTokens: 420_194,
      inputTokens: 121_446,
      cacheReadTokens: 296_448,
      cacheWriteTokens: 0,
      outputTokens: 2_300,
      reasoningTokens: 351,
      apiCalls: 12,
    });
  });

  test("accepts a fresh gateway measurement for the same session and model", () => {
    const metrics = buildSessionMetrics({
      row,
      recentLastActive: "2026-07-15T01:01:23.153Z",
      gateway: {
        session_id: "session-1",
        last_prompt_tokens: 70_587,
        updated_at: "2026-07-15T01:01:23.337Z",
      },
      modelInfo: {
        model: "gpt-5.6-luna",
        provider: "openai-codex",
        effective_context_length: 272_000,
      },
    });

    expect(metrics.context).toMatchObject({
      usedTokens: 70_587,
      maxTokens: 272_000,
      remainingTokens: 201_413,
    });
    expect(metrics.context?.percent).toBeCloseTo(25.951, 3);
    expect(metrics.reasoningEffort).toBe("low");
  });

  test("rejects stale, mismatched, and unavailable gateway measurements", () => {
    const base = {
      row,
      recentLastActive: "2026-07-15T01:01:23.000Z",
      modelInfo: {
        model: "gpt-5.6-luna",
        provider: "openai-codex",
        effective_context_length: 272_000,
      },
    };
    expect(buildSessionMetrics({
      ...base,
      gateway: {
        session_id: "session-1",
        last_prompt_tokens: 70_587,
        updated_at: "2026-07-15T01:01:26.000Z",
      },
    }).context).toBeNull();
    expect(buildSessionMetrics({
      ...base,
      gateway: {
        session_id: "another-session",
        last_prompt_tokens: 70_587,
        updated_at: "2026-07-15T01:01:23.000Z",
      },
    }).context).toBeNull();
    expect(buildSessionMetrics({
      ...base,
      gateway: {
        session_id: "session-1",
        last_prompt_tokens: 70_587,
        updated_at: "2026-07-15T01:01:23.000Z",
      },
      modelInfo: { model: "gpt-5.5", effective_context_length: 272_000 },
    }).context).toBeNull();
    expect(buildSessionMetrics({ row })).toMatchObject({ context: null });
  });
});
