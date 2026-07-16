import { describe, expect, test } from "bun:test";
import {
  assertWorkItemTransition,
  assertWorkRunTransition,
  diffWorkPlans,
  isRetryableWorkFailure,
  normalizeHermesTodo,
  redactWorkText,
  selectPlanDelegationMember,
  validateAssignee,
  workItemKey,
} from "./work";

describe("work domain state machines", () => {
  test("accepts valid task and run transitions", () => {
    expect(() => assertWorkItemTransition("todo", "in_progress")).not.toThrow();
    expect(() => assertWorkItemTransition("review", "done")).not.toThrow();
    expect(() => assertWorkRunTransition("queued", "preparing")).not.toThrow();
    expect(() =>
      assertWorkRunTransition("waiting_input", "running"),
    ).not.toThrow();
  });

  test("rejects terminal run resurrection and invalid task jumps", () => {
    expect(() => assertWorkRunTransition("succeeded", "running")).toThrow(
      /interdite/,
    );
    expect(() => assertWorkItemTransition("backlog", "done")).toThrow(
      /interdite/,
    );
  });

  test("classifies only infrastructure failures as retryable", () => {
    expect(isRetryableWorkFailure("relay_interrupted")).toBe(true);
    expect(isRetryableWorkFailure("permission_denied")).toBe(false);
    expect(isRetryableWorkFailure(null)).toBe(false);
  });
});

describe("Hermes todo normalization", () => {
  test("normalizes a complete list and reports multiple active steps", () => {
    const plan = normalizeHermesTodo([
      { id: "1", content: "Inspecter", status: "in_progress" },
      { id: "2", content: "Modifier", status: "in_progress" },
      { id: "3", content: "Tester", status: "pending" },
    ]);
    expect(plan.activeStepId).toBe("1");
    expect(plan.diagnostics).toEqual(["multiple_in_progress_steps"]);
  });

  test("keeps the last duplicate id in its final position", () => {
    const plan = normalizeHermesTodo([
      { id: "1", content: "Ancien", status: "pending" },
      { id: "2", content: "Autre", status: "pending" },
      { id: "1", content: "Nouveau", status: "completed" },
    ]);
    expect(plan.items.map((item) => item.id)).toEqual(["2", "1"]);
    expect(plan.items[1]).toEqual({
      id: "1",
      content: "Nouveau",
      status: "completed",
    });
  });

  test("rejects malformed and oversized plans", () => {
    expect(() => normalizeHermesTodo("not-a-list")).toThrow(/liste/);
    expect(() =>
      normalizeHermesTodo([{ id: "../1", content: "x", status: "pending" }]),
    ).toThrow(/Identifiant/);
    expect(() =>
      normalizeHermesTodo(
        Array.from({ length: 257 }, (_, id) => ({
          id: String(id),
          content: "x",
        })),
      ),
    ).toThrow(/256/);
  });

  test("redacts credentials without persisting private reasoning fields", () => {
    const plan = normalizeHermesTodo([
      {
        id: "1",
        content: "token=super-secret-token-value",
        status: "pending",
        reasoning: "private",
      },
    ]);
    expect(plan.items[0].content).toBe("token=[REDACTED]");
    expect(plan.items[0]).not.toHaveProperty("reasoning");
    expect(
      redactWorkText("Authorization: Bearer abcdefghijklmnopqrstuvwxyz"),
    ).toContain("[REDACTED]");
  });

  test("derives created, updated and removed steps", () => {
    expect(
      diffWorkPlans(
        [
          { id: "1", content: "Inspecter", status: "pending" },
          { id: "gone", content: "Retirer", status: "pending" },
        ],
        [
          { id: "1", content: "Inspecter", status: "completed" },
          { id: "2", content: "Tester", status: "pending" },
        ],
      ).map((change) => `${change.type}:${change.stepId}`),
    ).toEqual(["updated:1", "created:2", "removed:gone"]);
  });

  test("routes delegated plan steps deterministically across real members", () => {
    const members = ["reviewer-a", "reviewer-b"];
    expect(selectPlanDelegationMember(members, 0)).toBe("reviewer-a");
    expect(selectPlanDelegationMember(members, 1)).toBe("reviewer-b");
    expect(selectPlanDelegationMember(members, 2)).toBe("reviewer-a");
    expect(selectPlanDelegationMember([], 0)).toBeNull();
    expect(selectPlanDelegationMember(members, -1)).toBeNull();
  });
});

describe("work input invariants", () => {
  test("allows exactly one coherent assignee", () => {
    expect(() =>
      validateAssignee({ type: "agent", agentId: "agent" }),
    ).not.toThrow();
    expect(() => validateAssignee({ type: null })).not.toThrow();
    expect(() =>
      validateAssignee({ type: "agent", agentId: "agent", userId: "user" }),
    ).toThrow(/seul assigné/);
  });

  test("creates stable readable keys", () => {
    expect(workItemKey("mon-workspace", 42)).toBe("MONWO-42");
  });
});
