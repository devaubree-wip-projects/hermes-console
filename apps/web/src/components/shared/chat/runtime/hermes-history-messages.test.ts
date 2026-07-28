import { describe, expect, test } from "bun:test";
import { historyToMessages } from "@/components/shared/chat/runtime/hermes-history-messages";

describe("historyToMessages", () => {
  test("groups consecutive tool rows into one assistant turn", () => {
    const messages = historyToMessages([
      { role: "user", text: "liste les dossiers", timestamp: 1 },
      { role: "tool", name: "skill_view", timestamp: 2 },
      { role: "tool", name: "search_files", timestamp: 3 },
      { role: "tool", name: "terminal", timestamp: 4 },
      { role: "assistant", text: "Voici la liste.", timestamp: 5 },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("user");
    expect(messages[1]?.role).toBe("assistant");

    const assistant = messages[1];
    if (!assistant || assistant.role !== "assistant") {
      throw new Error("expected assistant message");
    }

    expect(assistant.content).toEqual([
      {
        type: "tool-call",
        toolCallId: "hermes-history-tool-1",
        toolName: "skill_view",
        args: {},
        argsText: "",
        result: "Terminé",
      },
      {
        type: "tool-call",
        toolCallId: "hermes-history-tool-2",
        toolName: "search_files",
        args: {},
        argsText: "",
        result: "Terminé",
      },
      {
        type: "tool-call",
        toolCallId: "hermes-history-tool-3",
        toolName: "terminal",
        args: {},
        argsText: "",
        result: "Terminé",
      },
      { type: "text", text: "Voici la liste." },
    ]);
  });

  test("restores reasoning parts from persisted assistant rows", () => {
    const messages = historyToMessages([
      { role: "user", text: "météo", timestamp: 1 },
      {
        role: "assistant",
        text: "Il va pleuvoir.",
        reasoning: "Je regarde wttr.in",
        timestamp: 2,
      },
    ]);

    const assistant = messages[1];
    if (!assistant || assistant.role !== "assistant") {
      throw new Error("expected assistant message");
    }
    expect(assistant.content).toEqual([
      { type: "reasoning", text: "Je regarde wttr.in" },
      { type: "text", text: "Il va pleuvoir." },
    ]);
  });

  test("does not emit legacy Outil exécuté text rows", () => {
    const messages = historyToMessages([
      { role: "user", text: "go", timestamp: 1 },
      { role: "tool", name: "terminal", timestamp: 2 },
      { role: "assistant", text: "done", timestamp: 3 },
    ]);

    const serialized = JSON.stringify(messages);
    expect(serialized).not.toContain("Outil exécuté");
  });

  test("keeps separate assistant turns between user messages", () => {
    const messages = historyToMessages([
      { role: "user", text: "first", timestamp: 1 },
      { role: "assistant", text: "answer one", timestamp: 2 },
      { role: "user", text: "second", timestamp: 3 },
      { role: "tool", name: "read_file", timestamp: 4 },
      { role: "assistant", text: "answer two", timestamp: 5 },
    ]);

    expect(messages).toHaveLength(4);
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);

    const secondAssistant = messages[3];
    if (!secondAssistant || secondAssistant.role !== "assistant") {
      throw new Error("expected second assistant message");
    }
    expect(secondAssistant.content).toEqual([
      {
        type: "tool-call",
        toolCallId: "hermes-history-tool-3",
        toolName: "read_file",
        args: {},
        argsText: "",
        result: "Terminé",
      },
      { type: "text", text: "answer two" },
    ]);
  });
});
