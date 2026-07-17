import type { ThreadMessage } from "@assistant-ui/react";
import type { JsonObject } from "@/lib/hermes/protocol";
import {
  createToolCallPart,
  defaultAssistantMessageMetadata,
} from "@/components/shared/chat/runtime/hermes-message-updates";

type AssistantMessage = Extract<ThreadMessage, { role: "assistant" }>;
type AssistantContentPart = AssistantMessage["content"][number];

type PendingAssistantTurn = {
  id: string;
  createdAt: Date;
  content: AssistantContentPart[];
};

function dateFromHermes(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return new Date(value < 10_000_000_000 ? value * 1_000 : value);
  }
  if (typeof value === "string" && value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return new Date(numeric < 10_000_000_000 ? numeric * 1_000 : numeric);
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return undefined;
}

function userMessage(
  id: string,
  text: string,
  createdAt: Date,
): ThreadMessage {
  return {
    id,
    role: "user",
    createdAt,
    content: [{ type: "text", text }],
    attachments: [],
    metadata: { custom: {} },
  };
}

function completedAssistantMessage(
  pending: PendingAssistantTurn,
): AssistantMessage {
  return {
    id: pending.id,
    role: "assistant",
    createdAt: pending.createdAt,
    content: pending.content,
    status: { type: "complete", reason: "stop" },
    metadata: defaultAssistantMessageMetadata(),
  };
}

function appendAssistantTextPart(content: AssistantContentPart[], text: string) {
  const next = content.slice();
  const last = next[next.length - 1];
  if (last?.type === "text") {
    next[next.length - 1] = { type: "text", text: `${last.text}\n${text}` };
    return next;
  }
  next.push({ type: "text", text });
  return next;
}

export function historyToMessages(history: JsonObject[]): ThreadMessage[] {
  const messages: ThreadMessage[] = [];
  let pending: PendingAssistantTurn | null = null;

  const flushPending = () => {
    if (!pending || pending.content.length === 0) {
      pending = null;
      return;
    }
    messages.push(completedAssistantMessage(pending));
    pending = null;
  };

  const ensurePending = (index: number, createdAt: Date) => {
    if (pending) return;
    pending = {
      id: `hermes-history-assistant-${index}`,
      createdAt,
      content: [],
    };
  };

  history.forEach((row, index) => {
    const role = row.role;
    const text = typeof row.text === "string" ? row.text : "";
    const reasoning = typeof row.reasoning === "string" ? row.reasoning : "";
    const createdAt = dateFromHermes(
      typeof row.timestamp === "number" || typeof row.timestamp === "string"
        ? row.timestamp
        : undefined,
    ) ?? new Date();

    if (role === "user" && text) {
      flushPending();
      messages.push(userMessage(`hermes-history-user-${index}`, text, createdAt));
      return;
    }

    if (role === "tool") {
      const name = typeof row.name === "string" ? row.name : "outil";
      const result = typeof row.result === "string"
        ? row.result
        : typeof row.text === "string" && row.text
          ? row.text
          : "Terminé";
      const argsText = typeof row.context === "string" ? row.context : "";
      ensurePending(index, createdAt);
      pending!.content.push({
        ...createToolCallPart(`hermes-history-tool-${index}`, name),
        ...(argsText ? { argsText } : {}),
        result,
      });
      return;
    }

    if (role === "assistant" && (text || reasoning)) {
      ensurePending(index, createdAt);
      if (reasoning) {
        const last = pending!.content[pending!.content.length - 1];
        if (last?.type === "reasoning") {
          pending!.content[pending!.content.length - 1] = {
            type: "reasoning",
            text: `${last.text}\n${reasoning}`,
          };
        } else {
          pending!.content.push({ type: "reasoning", text: reasoning });
        }
      }
      if (text) {
        pending!.content = appendAssistantTextPart(pending!.content, text);
      }
    }
  });

  flushPending();
  return messages;
}

export function historyVersion(history: JsonObject[]) {
  return JSON.stringify(history.map((row) => [
    row.role,
    row.text,
    row.reasoning,
    row.name,
    row.result,
    row.context,
    row.timestamp,
  ]));
}
