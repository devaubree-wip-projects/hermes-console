import type { JsonObject } from "@/lib/hermes/protocol";

export type HermesStoredMessage = {
  role?: unknown;
  content?: unknown;
  tool_name?: unknown;
  timestamp?: unknown;
};

const VISIBLE_ROLES = new Set(["user", "assistant", "tool", "system"]);

export function normalizeStoredHistory(
  rows: HermesStoredMessage[] | null | undefined,
): JsonObject[] {
  return (rows ?? []).flatMap((row) => {
    const role = typeof row.role === "string" ? row.role : "";
    if (!VISIBLE_ROLES.has(role)) return [];

    const text = typeof row.content === "string" ? row.content : "";
    const name = typeof row.tool_name === "string" ? row.tool_name : undefined;
    if (role !== "tool" && !text.trim()) return [];

    return [{
      role,
      ...(role !== "tool" && text ? { text } : {}),
      ...(role === "tool" && text ? { result: text } : {}),
      ...(name ? { name } : {}),
      ...(typeof row.timestamp === "number" ? { timestamp: row.timestamp } : {}),
    } satisfies JsonObject];
  });
}
