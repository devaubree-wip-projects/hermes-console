import { describe, expect, test } from "bun:test";
import {
  assertRunnableBrief,
  assertWorkItemReachable,
  assertWorkItemTransition,
  assertWorkRunTransition,
  canReachWorkItemStatus,
  deriveWorkExecutionState,
  diffWorkPlans,
  hasValidDeliverable,
  isMetaSummary,
  isRetryableWorkFailure,
  normalizeHermesTodo,
  redactWorkText,
  resolveDeliveryOutcome,
  resolveWorkItemTransitionPath,
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

  test("rejects terminal run resurrection and invalid direct task jumps", () => {
    expect(() => assertWorkRunTransition("succeeded", "running")).toThrow(
      /interdite/,
    );
    expect(() => assertWorkItemTransition("backlog", "done")).toThrow(
      /interdite/,
    );
  });

  test("resolves multi-hop kanban paths for reachable targets", () => {
    expect(resolveWorkItemTransitionPath("in_progress", "todo")).toEqual([
      "todo",
    ]);
    expect(resolveWorkItemTransitionPath("backlog", "done")).toEqual([
      "todo",
      "in_progress",
      "done",
    ]);
    expect(resolveWorkItemTransitionPath("todo", "todo")).toEqual([]);
    expect(canReachWorkItemStatus("backlog", "done")).toBe(true);
    expect(() => assertWorkItemReachable("backlog", "done")).not.toThrow();
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

describe("work delivery truth", () => {
  test("flags meta-only summaries and keeps real content", () => {
    expect(isMetaSummary("")).toBe(true);
    expect(isMetaSummary("ok")).toBe(true);
    expect(isMetaSummary("Dossier vide.")).toBe(true);
    expect(isMetaSummary("Rien à faire")).toBe(true);
    expect(isMetaSummary("Aucune action requise")).toBe(true);
    expect(isMetaSummary("Tâche terminée")).toBe(true);
    expect(isMetaSummary("empty directory")).toBe(true);
    expect(
      isMetaSummary("Corrigé le parseur d'auth dans auth.go ligne 42"),
    ).toBe(false);
    expect(isMetaSummary("Tâche terminée : j'ai créé le rapport final")).toBe(
      false,
    );
  });

  test("recognises a valid deliverable from any of the accepted signals", () => {
    const empty = { summary: null, comments: [], resources: [] };
    expect(hasValidDeliverable(empty)).toBe(false);
    expect(
      hasValidDeliverable({ ...empty, resources: [{ id: "res-1" }] }),
    ).toBe(true);
    expect(
      hasValidDeliverable({
        ...empty,
        comments: [{ content: "Rapport livré avec les chiffres", authorType: "agent" }],
      }),
    ).toBe(true);
    expect(
      hasValidDeliverable({ ...empty, summary: "Voir https://github.com/x/y/pull/3" }),
    ).toBe(true);
    // A meta agent comment or a user comment alone is not a deliverable.
    expect(
      hasValidDeliverable({
        ...empty,
        comments: [
          { content: "Dossier vide.", authorType: "agent" },
          { content: "Merci, c'est parfait et bien joué", authorType: "user" },
        ],
      }),
    ).toBe(false);
  });

  test("resolveDeliveryOutcome follows the four contract branches", () => {
    const base = {
      runStatus: "succeeded" as const,
      reviewPolicy: "none" as const,
      hasDeliverable: true,
      agentBlocker: false,
    };
    // 1. no deliverable -> blocked/no_deliverable
    expect(resolveDeliveryOutcome({ ...base, hasDeliverable: false })).toEqual({
      status: "blocked",
      reason: "no_deliverable",
    });
    // 2. deliverable + required -> review
    expect(
      resolveDeliveryOutcome({ ...base, reviewPolicy: "required" }),
    ).toEqual({ status: "review" });
    // 3. deliverable + none/optional -> done
    expect(resolveDeliveryOutcome(base)).toEqual({ status: "done" });
    expect(
      resolveDeliveryOutcome({ ...base, reviewPolicy: "optional" }),
    ).toEqual({ status: "done" });
    // 4. agent blocker -> blocked/agent_blocker, even on a succeeded run with a deliverable
    expect(resolveDeliveryOutcome({ ...base, agentBlocker: true })).toEqual({
      status: "blocked",
      reason: "agent_blocker",
    });
    // 5. delegations cut off by the parent -> blocked, even with a confident summary
    expect(
      resolveDeliveryOutcome({ ...base, abandonedDelegations: true }),
    ).toEqual({ status: "blocked", reason: "abandoned_delegations" });
    // an untouched run keeps the plain done branch
    expect(
      resolveDeliveryOutcome({ ...base, abandonedDelegations: false }),
    ).toEqual({ status: "done" });
    // cancelled run maps to cancelled item; failed run is a business failure -> blocked
    expect(
      resolveDeliveryOutcome({ ...base, runStatus: "cancelled" }),
    ).toEqual({ status: "cancelled" });
    expect(resolveDeliveryOutcome({ ...base, runStatus: "failed" })).toEqual({
      status: "blocked",
    });
  });

  test("deriveWorkExecutionState projects the live run state for the badge", () => {
    expect(
      deriveWorkExecutionState({ activeRunCount: 0, latestRunStatus: null }),
    ).toBe("idle");
    expect(
      deriveWorkExecutionState({
        activeRunCount: 1,
        latestRunStatus: "queued",
      }),
    ).toBe("queued");
    expect(
      deriveWorkExecutionState({
        activeRunCount: 1,
        latestRunStatus: "running",
      }),
    ).toBe("running");
    expect(
      deriveWorkExecutionState({
        activeRunCount: 1,
        latestRunStatus: "waiting_input",
      }),
    ).toBe("waiting_input");
    expect(
      deriveWorkExecutionState({
        activeRunCount: 0,
        latestRunStatus: "succeeded",
      }),
    ).toBe("succeeded");
    expect(
      deriveWorkExecutionState({
        activeRunCount: 0,
        latestRunStatus: "failed",
      }),
    ).toBe("failed");
    // A cancelled last run leaves nothing working: idle, not a stale badge.
    expect(
      deriveWorkExecutionState({
        activeRunCount: 0,
        latestRunStatus: "cancelled",
      }),
    ).toBe("idle");
  });

  test("assertRunnableBrief gates a run with no matter to work on", () => {
    expect(() =>
      assertRunnableBrief({
        description: "",
        linkedResourceCount: 0,
        projectResourceCount: 0,
      }),
    ).toThrow(/matière/);
    // Any one of description / linked resource / project resource is enough.
    expect(() =>
      assertRunnableBrief({
        description: "Résume le trimestre",
        linkedResourceCount: 0,
        projectResourceCount: 0,
      }),
    ).not.toThrow();
    expect(() =>
      assertRunnableBrief({
        description: "   ",
        linkedResourceCount: 1,
        projectResourceCount: 0,
      }),
    ).not.toThrow();
    expect(() =>
      assertRunnableBrief({
        description: "",
        linkedResourceCount: 0,
        projectResourceCount: 3,
      }),
    ).not.toThrow();
  });
});
