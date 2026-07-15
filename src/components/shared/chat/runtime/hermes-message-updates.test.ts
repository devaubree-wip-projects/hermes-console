import { describe, expect, test } from "bun:test";
import type { ThreadMessage } from "@assistant-ui/react";
import {
  appendAssistantReasoning,
  appendAssistantText,
  appendAssistantToolStart,
  ensureRunningAssistant,
  prepareMessagesForEdit,
  prepareMessagesForReload,
  sliceMessagesUntil,
  updateAssistantTool,
} from "@/components/shared/chat/runtime/hermes-message-updates";

const user = (id: string): ThreadMessage => ({
  id,
  role: "user",
  createdAt: new Date(),
  content: [{ type: "text", text: id }],
  attachments: [],
  metadata: { custom: {} },
});

const assistant = (id: string): ThreadMessage => ({
  id,
  role: "assistant",
  createdAt: new Date(),
  content: [{ type: "text", text: `${id}-text` }],
  status: { type: "complete", reason: "stop" },
  metadata: {
    unstable_state: null,
    unstable_annotations: [],
    unstable_data: [],
    steps: [],
    custom: {},
  },
});

function lastAssistant(messages: ReturnType<typeof appendAssistantText>) {
  return messages.findLast((message) => message.role === "assistant");
}

describe("Hermes assistant message updates", () => {
  test("creates a running assistant for reasoning deltas", () => {
    const messages = appendAssistantReasoning([], "Thinking");
    const assistant = lastAssistant(messages);
    expect(assistant?.status).toEqual({ type: "running" });
    expect(assistant?.content).toEqual([{ type: "reasoning", text: "Thinking" }]);
  });

  test("appends reasoning before assistant text on the same message", () => {
    let messages = appendAssistantReasoning([], "Step one. ");
    messages = appendAssistantReasoning(messages, "Step two.");
    messages = ensureRunningAssistant(messages);
    messages = appendAssistantText(messages, "Hello", false);
    messages = appendAssistantText(messages, "Hello world", true);

    const assistant = lastAssistant(messages);
    expect(assistant?.status).toEqual({ type: "complete", reason: "stop" });
    expect(assistant?.content).toEqual([
      { type: "reasoning", text: "Step one. Step two." },
      { type: "text", text: "Hello world" },
    ]);
  });

  test("replaces streamed text on complete while preserving reasoning", () => {
    let messages = appendAssistantReasoning([], "Reasoning");
    messages = appendAssistantText(messages, "partial", false);
    messages = appendAssistantText(messages, "Final answer.", true);

    const assistant = lastAssistant(messages);
    expect(assistant?.content).toEqual([
      { type: "reasoning", text: "Reasoning" },
      { type: "text", text: "Final answer." },
    ]);
  });

  test("prepares reload state by keeping the parent user turn only", () => {
    const messages = [user("u1"), assistant("a1"), user("u2"), assistant("a2")];
    expect(sliceMessagesUntil(messages, "u2").map((message) => message.id)).toEqual([
      "u1",
      "a1",
      "u2",
      "a2",
    ]);
    expect(prepareMessagesForReload(messages, "u2").map((message) => message.id)).toEqual([
      "u1",
      "a1",
      "u2",
    ]);
    expect(prepareMessagesForReload(messages, "u1").map((message) => message.id)).toEqual([
      "u1",
    ]);
  });

  test("prepares edit state by truncating from the edited user turn", () => {
    const messages = [user("u1"), assistant("a1"), user("u2"), assistant("a2")];
    expect(prepareMessagesForEdit(messages, "u2").map((message) => message.id)).toEqual([
      "u1",
      "a1",
    ]);
    expect(prepareMessagesForEdit(messages, "u1").map((message) => message.id)).toEqual([]);
  });

  test("keeps reasoning and tool calls in one assistant turn", () => {
    let messages = appendAssistantReasoning([], "Step one");
    messages = appendAssistantToolStart(messages, "terminal", "tool-1");
    messages = updateAssistantTool(messages, "tool-1", { preview: "ls -la" });
    messages = updateAssistantTool(messages, "tool-1", { result: "done" });
    messages = appendAssistantReasoning(messages, "Step two");

    const assistant = lastAssistant(messages);
    expect(assistant?.content).toEqual([
      { type: "reasoning", text: "Step one" },
      {
        type: "tool-call",
        toolCallId: "tool-1",
        toolName: "terminal",
        args: {},
        argsText: "ls -la",
        result: "done",
      },
      { type: "reasoning", text: "Step two" },
    ]);
  });
});
