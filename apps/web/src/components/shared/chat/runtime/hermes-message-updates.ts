import type { ThreadMessage } from "@assistant-ui/react";

type AssistantMessage = Extract<ThreadMessage, { role: "assistant" }>;
type AssistantContentPart = AssistantMessage["content"][number];

export function defaultAssistantMessageMetadata(): AssistantMessage["metadata"] {
  return {
    unstable_state: null,
    unstable_annotations: [],
    unstable_data: [],
    steps: [],
    custom: {},
  };
}

const defaultAssistantMetadata = (): AssistantMessage["metadata"] =>
  defaultAssistantMessageMetadata();

type ToolCallPart = Extract<AssistantContentPart, { type: "tool-call" }>;

function findRunningToolIndex(
  content: readonly AssistantContentPart[],
  toolId?: string,
) {
  for (let index = content.length - 1; index >= 0; index -= 1) {
    const part = content[index];
    if (part?.type !== "tool-call") continue;
    if (toolId && part.toolCallId !== toolId) continue;
    if (part.result === undefined) return index;
  }
  return -1;
}

export function createToolCallPart(toolCallId: string, toolName: string): ToolCallPart {
  return {
    type: "tool-call",
    toolCallId,
    toolName,
    args: {},
    argsText: "",
  };
}

function findRunningAssistant(messages: ThreadMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && message.status?.type === "running") {
      return { index, message: message as AssistantMessage };
    }
  }
  return null;
}

function updateRunningAssistant(
  messages: ThreadMessage[],
  updateContent: (content: AssistantContentPart[]) => AssistantContentPart[],
  complete = false,
) {
  const next = messages.slice();
  const running = findRunningAssistant(next);
  const id = running?.message.id ?? `hermes-assistant-${crypto.randomUUID()}`;
  const message: AssistantMessage = {
    id,
    role: "assistant",
    createdAt: running?.message.createdAt ?? new Date(),
    content: updateContent(running?.message.content.slice() ?? []),
    status: complete
      ? { type: "complete", reason: "stop" }
      : { type: "running" },
    metadata: running?.message.metadata ?? defaultAssistantMetadata(),
  };
  if (running) {
    next[running.index] = message;
  } else {
    next.push(message);
  }
  return next;
}

export function ensureRunningAssistant(messages: ThreadMessage[]) {
  if (findRunningAssistant(messages)) return messages;
  return updateRunningAssistant(messages, () => [], false);
}

export function appendAssistantReasoning(
  messages: ThreadMessage[],
  delta: string,
) {
  if (!delta) return ensureRunningAssistant(messages);
  return updateRunningAssistant(messages, (content) => {
    const next = content.slice();
    const last = next[next.length - 1];
    if (last?.type === "reasoning") {
      next[next.length - 1] = { type: "reasoning", text: `${last.text}${delta}` };
      return next;
    }
    next.push({ type: "reasoning", text: delta });
    return next;
  }, false);
}

export function appendAssistantText(
  messages: ThreadMessage[],
  delta: string,
  complete: boolean,
) {
  return updateRunningAssistant(messages, (content) => {
    const next = content.slice();
    if (complete && delta) {
      const preserved = next.filter((part) => part.type !== "text");
      return [...preserved, { type: "text", text: delta }];
    }
    const last = next[next.length - 1];
    if (last?.type === "text") {
      next[next.length - 1] = { type: "text", text: `${last.text}${delta}` };
      return next;
    }
    if (delta) next.push({ type: "text", text: delta });
    return next;
  }, complete);
}

export function appendAssistantToolStart(
  messages: ThreadMessage[],
  toolName: string,
  toolId?: string,
) {
  const toolCallId = toolId?.trim() || `hermes-tool-${crypto.randomUUID()}`;
  return updateRunningAssistant(messages, (content) => [
    ...content,
    createToolCallPart(toolCallId, toolName),
  ], false);
}

export function updateAssistantTool(
  messages: ThreadMessage[],
  toolId: string | undefined,
  patch: { preview?: string; result?: string },
) {
  return updateRunningAssistant(messages, (content) => {
    const index = findRunningToolIndex(content, toolId);
    if (index < 0) return content;
    const current = content[index] as ToolCallPart;
    const next = content.slice();
    next[index] = {
      ...current,
      ...(patch.preview !== undefined ? { argsText: patch.preview } : {}),
      ...(patch.result !== undefined ? { result: patch.result } : {}),
    };
    return next;
  }, false);
}

export function sliceMessagesUntil(
  messages: ThreadMessage[],
  messageId: string | null,
) {
  if (messageId == null) return [];

  let messageIdx = messages.findIndex((message) => message.id === messageId);
  if (messageIdx === -1) {
    throw new Error("Hermes reload: message not found.");
  }

  while (messages[messageIdx + 1]?.role === "assistant") {
    messageIdx += 1;
  }

  return messages.slice(0, messageIdx + 1);
}

export function prepareMessagesForReload(
  messages: ThreadMessage[],
  parentId: string | null,
) {
  const trimmed = sliceMessagesUntil(messages, parentId).slice();
  while (trimmed.at(-1)?.role === "assistant") {
    trimmed.pop();
  }
  return trimmed;
}

export function prepareMessagesForEdit(
  messages: ThreadMessage[],
  editedMessageId: string,
) {
  const messageIdx = messages.findIndex((message) => message.id === editedMessageId);
  if (messageIdx === -1) {
    throw new Error("Hermes edit: message not found.");
  }
  return messages.slice(0, messageIdx);
}

export function textFromThreadUserMessage(message: ThreadMessage) {
  if (message.role !== "user") return "";
  return message.content
    .filter((part): part is Extract<(typeof message.content)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}
