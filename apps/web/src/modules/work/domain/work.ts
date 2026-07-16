import type {
  WorkItemStatus,
  WorkPlanStepStatus,
  WorkRunStatus,
} from "@/db/schema";

export const WORK_ITEM_STATUSES: readonly WorkItemStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "blocked",
  "review",
  "done",
  "cancelled",
];

export const WORK_RUN_STATUSES: readonly WorkRunStatus[] = [
  "queued",
  "preparing",
  "running",
  "waiting_input",
  "cancelling",
  "succeeded",
  "failed",
  "cancelled",
];

const itemTransitions: Record<WorkItemStatus, readonly WorkItemStatus[]> = {
  backlog: ["todo", "cancelled"],
  todo: ["backlog", "in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "review", "done", "cancelled"],
  blocked: ["todo", "in_progress", "cancelled"],
  review: ["in_progress", "done", "cancelled"],
  done: ["todo"],
  cancelled: ["backlog"],
};

const runTransitions: Record<WorkRunStatus, readonly WorkRunStatus[]> = {
  queued: ["preparing", "cancelling", "cancelled"],
  preparing: ["running", "failed", "cancelling", "cancelled"],
  running: ["waiting_input", "succeeded", "failed", "cancelling"],
  waiting_input: ["running", "failed", "cancelling"],
  cancelling: ["cancelled", "failed"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function canTransitionWorkItem(
  from: WorkItemStatus,
  to: WorkItemStatus,
) {
  return from === to || itemTransitions[from].includes(to);
}

export function canTransitionWorkRun(from: WorkRunStatus, to: WorkRunStatus) {
  return from === to || runTransitions[from].includes(to);
}

export function assertWorkItemTransition(
  from: WorkItemStatus,
  to: WorkItemStatus,
) {
  if (!canTransitionWorkItem(from, to)) {
    throw new WorkDomainError(
      "invalid_work_item_transition",
      `Transition tâche interdite : ${from} → ${to}.`,
    );
  }
}

export function assertWorkRunTransition(
  from: WorkRunStatus,
  to: WorkRunStatus,
) {
  if (!canTransitionWorkRun(from, to)) {
    throw new WorkDomainError(
      "invalid_work_run_transition",
      `Transition run interdite : ${from} → ${to}.`,
    );
  }
}

export class WorkDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WorkDomainError";
  }
}

export type WorkPlanStep = {
  id: string;
  content: string;
  status: WorkPlanStepStatus;
};

export type NormalizedWorkPlan = {
  items: WorkPlanStep[];
  activeStepId: string | null;
  diagnostics: string[];
};

const PLAN_STATUSES = new Set<WorkPlanStepStatus>([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);
const MAX_PLAN_ITEMS = 256;
const MAX_PLAN_CONTENT = 4_000;
const MAX_PLAN_ID = 128;
const REDACTED = "[REDACTED]";

export function redactWorkText(value: string) {
  return value
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
      REDACTED,
    )
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+\/-]{16,}/gi, `$1${REDACTED}`)
    .replace(
      /\b(api[_-]?key|token|password|secret)\s*[:=]\s*([^\s,;]{8,})/gi,
      `$1=${REDACTED}`,
    );
}

export function normalizeHermesTodo(value: unknown): NormalizedWorkPlan {
  if (!Array.isArray(value)) {
    throw new WorkDomainError(
      "invalid_plan",
      "Le plan Hermes doit être une liste.",
    );
  }
  if (value.length > MAX_PLAN_ITEMS) {
    throw new WorkDomainError(
      "plan_too_large",
      `Le plan dépasse ${MAX_PLAN_ITEMS} étapes.`,
    );
  }

  const parsed = value.map((raw, index): WorkPlanStep => {
    if (!raw || typeof raw !== "object") {
      throw new WorkDomainError(
        "invalid_plan_step",
        `Étape ${index + 1} invalide.`,
      );
    }
    const row = raw as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    const content = redactWorkText(String(row.content ?? "").trim());
    const status = String(row.status ?? "pending")
      .trim()
      .toLowerCase() as WorkPlanStepStatus;
    if (
      !id ||
      id.length > MAX_PLAN_ID ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(id)
    ) {
      throw new WorkDomainError(
        "invalid_plan_step_id",
        `Identifiant d’étape invalide à la position ${index + 1}.`,
      );
    }
    if (!content) {
      throw new WorkDomainError(
        "invalid_plan_step_content",
        `Description d’étape vide à la position ${index + 1}.`,
      );
    }
    if (!PLAN_STATUSES.has(status)) {
      throw new WorkDomainError(
        "invalid_plan_step_status",
        `Statut d’étape inconnu : ${String(row.status)}.`,
      );
    }
    return { id, content: content.slice(0, MAX_PLAN_CONTENT), status };
  });

  const lastPosition = new Map<string, number>();
  parsed.forEach((item, index) => lastPosition.set(item.id, index));
  const items = parsed.filter(
    (item, index) => lastPosition.get(item.id) === index,
  );
  const active = items.filter((item) => item.status === "in_progress");
  const diagnostics = active.length > 1 ? ["multiple_in_progress_steps"] : [];
  return { items, activeStepId: active[0]?.id ?? null, diagnostics };
}

export type WorkPlanChange = {
  type: "created" | "updated" | "removed";
  stepId: string;
  before?: WorkPlanStep;
  after?: WorkPlanStep;
};

export function diffWorkPlans(
  previous: readonly WorkPlanStep[],
  next: readonly WorkPlanStep[],
) {
  const before = new Map(previous.map((step) => [step.id, step]));
  const after = new Map(next.map((step) => [step.id, step]));
  const changes: WorkPlanChange[] = [];
  for (const step of next) {
    const current = before.get(step.id);
    if (!current) {
      changes.push({ type: "created", stepId: step.id, after: step });
    } else if (
      current.content !== step.content ||
      current.status !== step.status
    ) {
      changes.push({
        type: "updated",
        stepId: step.id,
        before: current,
        after: step,
      });
    }
  }
  for (const step of previous) {
    if (!after.has(step.id))
      changes.push({ type: "removed", stepId: step.id, before: step });
  }
  return changes;
}

export function selectPlanDelegationMember<T>(
  members: readonly T[],
  stepPosition: number,
) {
  if (
    !members.length ||
    !Number.isSafeInteger(stepPosition) ||
    stepPosition < 0
  )
    return null;
  return members[stepPosition % members.length];
}

const RETRYABLE_FAILURES = new Set([
  "edge_disconnected",
  "runtime_unavailable",
  "runtime_disconnected",
  "session_prepare_failed",
  "prompt_submit_failed",
  "lease_expired",
  "relay_interrupted",
  "preparation_timeout",
  "edge_crash",
]);

export function isRetryableWorkFailure(reason: string | null | undefined) {
  return reason ? RETRYABLE_FAILURES.has(reason) : false;
}

export function workItemTerminal(status: WorkItemStatus) {
  return status === "done" || status === "cancelled";
}

export function workRunTerminal(status: WorkRunStatus) {
  return (
    status === "succeeded" || status === "failed" || status === "cancelled"
  );
}

export function validateAssignee(input: {
  type?: string | null;
  userId?: string | null;
  agentId?: string | null;
  teamId?: string | null;
}) {
  const ids = [input.userId, input.agentId, input.teamId].filter(Boolean);
  if (!input.type) {
    if (ids.length)
      throw new WorkDomainError(
        "invalid_assignee",
        "Un type d’assigné est requis.",
      );
    return;
  }
  const expected =
    input.type === "user"
      ? input.userId
      : input.type === "agent"
        ? input.agentId
        : input.type === "team"
          ? input.teamId
          : null;
  if (!expected || ids.length !== 1) {
    throw new WorkDomainError(
      "invalid_assignee",
      "Un seul assigné cohérent est autorisé.",
    );
  }
}

export function workItemKey(workspaceSlug: string, number: number) {
  const prefix =
    workspaceSlug
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 5)
      .toUpperCase() || "WORK";
  return `${prefix}-${number}`;
}
