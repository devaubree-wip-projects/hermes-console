import { describe, expect, test } from "bun:test";
import { normalizeStoredHistory } from "@/lib/hermes/stored-history";

describe("normalizeStoredHistory", () => {
  test("keeps persisted Telegram turns and drops internal metadata", () => {
    expect(normalizeStoredHistory([
      { role: "user", content: "allo", timestamp: 1 },
      { role: "session_meta", content: null, timestamp: 2 },
      { role: "assistant", content: "Bonjour", timestamp: 3 },
    ])).toEqual([
      { role: "user", text: "allo", timestamp: 1 },
      { role: "assistant", text: "Bonjour", timestamp: 3 },
    ]);
  });

  test("keeps tool activity compact while preserving stored payload for detail views", () => {
    expect(normalizeStoredHistory([
      { role: "assistant", content: "", timestamp: 1 },
      { role: "tool", content: "very large result", tool_name: "terminal", timestamp: 2 },
    ])).toEqual([
      { role: "tool", name: "terminal", result: "very large result", timestamp: 2 },
    ]);
  });

  test("preserves assistant reasoning and tool context", () => {
    expect(normalizeStoredHistory([
      {
        role: "assistant",
        content: "Réponse",
        reasoning_content: "Je réfléchis",
        timestamp: 1,
      },
      {
        role: "tool",
        content: "{\"ok\":true}",
        tool_name: "browser_navigate",
        context: "https://example.com",
        timestamp: 2,
      },
    ])).toEqual([
      {
        role: "assistant",
        text: "Réponse",
        reasoning: "Je réfléchis",
        timestamp: 1,
      },
      {
        role: "tool",
        name: "browser_navigate",
        result: "{\"ok\":true}",
        context: "https://example.com",
        timestamp: 2,
      },
    ]);
  });
});
