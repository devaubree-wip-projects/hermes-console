import { describe, expect, test } from "bun:test";
import {
  getReasoningControlConfig,
  normalizeReasoningControlId,
  type ReasoningControlId,
} from "@/components/shared/chat/constants/reasoning-config";

function optionIds(provider: string, model: string, supportsReasoning = true) {
  return getReasoningControlConfig(provider, model, supportsReasoning)
    ?.options.map((option) => option.id);
}

describe("Hermes reasoning controls", () => {
  test("uses the OpenAI Codex effort levels for GPT reasoning models", () => {
    expect(optionIds("openai-codex", "gpt-5.6-luna")).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  test("uses max instead of xhigh for Claude 4.6", () => {
    expect(optionIds("anthropic", "claude-opus-4-6")).toEqual([
      "low",
      "medium",
      "high",
      "max",
    ]);
    expect(
      normalizeReasoningControlId(
        "anthropic",
        "claude-opus-4-6",
        "xhigh",
      ),
    ).toBe("high");
  });

  test("uses the modern adaptive matrix for Claude 4.7 and Fable", () => {
    const expected: ReasoningControlId[] = [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ];
    expect(optionIds("anthropic", "claude-opus-4-7")).toEqual(expected);
    expect(optionIds("anthropic", "claude-fable-5")).toEqual(expected);
  });

  test("keeps the manual-thinking matrix for legacy Claude models", () => {
    expect(optionIds("anthropic", "claude-haiku-4-5-20251001")).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  test("hides unknown, MoA, and explicitly unsupported controls", () => {
    expect(getReasoningControlConfig("moa", "default")).toBeNull();
    expect(getReasoningControlConfig("custom", "gpt-5.5")).toBeNull();
    expect(
      getReasoningControlConfig("openai-codex", "gpt-5.5", false),
    ).toBeNull();
  });
});
