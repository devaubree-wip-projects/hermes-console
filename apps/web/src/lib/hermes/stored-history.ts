import type { JsonObject } from "@/lib/hermes/protocol";

export type HermesStoredMessage = {
  role?: unknown;
  content?: unknown;
  text?: unknown;
  result?: unknown;
  tool_name?: unknown;
  name?: unknown;
  context?: unknown;
  reasoning?: unknown;
  reasoning_content?: unknown;
  timestamp?: unknown;
};

const VISIBLE_ROLES = new Set(["user", "assistant", "tool", "system"]);

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function reasoningTextFromRow(row: HermesStoredMessage) {
  return (
    stringField(row.reasoning).trim()
    || stringField(row.reasoning_content).trim()
  );
}

export function normalizeStoredHistory(
  rows: HermesStoredMessage[] | null | undefined,
): JsonObject[] {
  return (rows ?? []).flatMap((row) => {
    const role = typeof row.role === "string" ? row.role : "";
    if (!VISIBLE_ROLES.has(role)) return [];

    const text = stringField(row.content) || stringField(row.text);
    const result = stringField(row.result) || text;
    const name = stringField(row.tool_name) || stringField(row.name) || undefined;
    const context = stringField(row.context).trim();
    const reasoning = reasoningTextFromRow(row);

    if (role === "tool") {
      if (!result.trim() && !context && !name) return [];
      return [{
        role,
        ...(name ? { name } : {}),
        ...(result.trim() ? { result } : {}),
        ...(context ? { context } : {}),
        ...(typeof row.timestamp === "number" ? { timestamp: row.timestamp } : {}),
      } satisfies JsonObject];
    }

    if (!text.trim() && !reasoning) return [];

    return [{
      role,
      ...(text.trim() ? { text } : {}),
      ...(reasoning ? { reasoning } : {}),
      ...(typeof row.timestamp === "number" ? { timestamp: row.timestamp } : {}),
    } satisfies JsonObject];
  });
}
