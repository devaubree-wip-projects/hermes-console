import { describe, expect, test } from "bun:test";
import { createLogger, normalizedRequestId } from "./logger";

describe("application logger", () => {
  test("emits structured JSON and recursively redacts credentials", () => {
    const lines: string[] = [];
    const logger = createLogger({
      environment: "production",
      format: "json",
      level: "debug",
      now: () => new Date("2026-07-15T18:00:00.000Z"),
      write: (_, line) => lines.push(line),
    });

    logger.error("provider token=visible", {
      requestId: "request-123",
      authorization: "Bearer visible",
      nested: { password: "visible", safe: "kept" },
      error: new Error("Authorization: Bearer visible"),
      level: "forged",
      service: "forged",
    });

    const record = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(record).toMatchObject({
      timestamp: "2026-07-15T18:00:00.000Z",
      level: "error",
      service: "hermes-web",
      environment: "production",
      requestId: "request-123",
      authorization: "[REDACTED]",
      nested: { password: "[REDACTED]", safe: "kept" },
    });
    expect(lines[0]).not.toContain("visible");
  });

  test("filters entries below the configured level", () => {
    const lines: string[] = [];
    const logger = createLogger({ level: "warn", write: (_, line) => lines.push(line) });
    logger.debug("debug");
    logger.info("info");
    logger.warn("warning");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("warning");
  });

  test("keeps safe request ids and replaces hostile values", () => {
    expect(normalizedRequestId("request-123")).toBe("request-123");
    expect(normalizedRequestId("bad value")).toMatch(/^[0-9a-f-]{36}$/);
  });
});
