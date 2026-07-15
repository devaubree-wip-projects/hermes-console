import { describe, expect, test } from "bun:test";

import { shouldInvalidateSessionMetrics } from "./session-invalidation-policy";

const event = (reason: "subscribed" | "changed" | "reconcile") => ({
  __bridge__: "session.invalidated" as const,
  sessionId: "session-1",
  cursor: 1,
  reason,
});

describe("session invalidation policy", () => {
  test("does not refresh metrics for the initial subscription acknowledgement", () => {
    expect(shouldInvalidateSessionMetrics(event("subscribed"))).toBe(false);
  });

  test("refreshes metrics for actual changes and reconciliation", () => {
    expect(shouldInvalidateSessionMetrics(event("changed"))).toBe(true);
    expect(shouldInvalidateSessionMetrics(event("reconcile"))).toBe(true);
  });
});
