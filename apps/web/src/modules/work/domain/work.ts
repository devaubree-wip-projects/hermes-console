import type {
  WorkItemStatus,
  WorkPlanStepStatus,
  WorkReviewPolicy,
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

export const WORK_ITEM_TRANSITIONS: Record<
  WorkItemStatus,
  readonly WorkItemStatus[]
> = {
  backlog: ["todo", "cancelled"],
  todo: ["backlog", "in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "review", "done", "cancelled", "todo"],
  blocked: ["todo", "in_progress", "cancelled"],
  review: ["in_progress", "done", "cancelled", "todo"],
  done: ["todo"],
  cancelled: ["backlog"],
};

const itemTransitions = WORK_ITEM_TRANSITIONS;

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

/** Shortest hop chain `from → … → to` (excludes `from`). `[]` if same status, `null` if unreachable. */
export function resolveWorkItemTransitionPath(
  from: WorkItemStatus,
  to: WorkItemStatus,
): WorkItemStatus[] | null {
  if (from === to) return [];
  const parent = new Map<WorkItemStatus, WorkItemStatus | null>([[from, null]]);
  const queue: WorkItemStatus[] = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of itemTransitions[current]) {
      if (parent.has(next)) continue;
      parent.set(next, current);
      if (next === to) {
        const path: WorkItemStatus[] = [];
        let cursor: WorkItemStatus | null = to;
        while (cursor && cursor !== from) {
          path.push(cursor);
          cursor = parent.get(cursor) ?? null;
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

export function canReachWorkItemStatus(
  from: WorkItemStatus,
  to: WorkItemStatus,
) {
  return resolveWorkItemTransitionPath(from, to) !== null;
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

export function assertWorkItemReachable(
  from: WorkItemStatus,
  to: WorkItemStatus,
) {
  const path = resolveWorkItemTransitionPath(from, to);
  if (!path) {
    throw new WorkDomainError(
      "invalid_work_item_transition",
      `Transition tâche interdite : ${from} → ${to}.`,
    );
  }
  return path;
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

const META_SUMMARY_MIN_LENGTH = 12;
const META_SUMMARY_PATTERNS: readonly RegExp[] = [
  /^(?:dossier|r[ée]pertoire)\s+vide\.?$/,
  /^rien\s+[àa]\s+(?:faire|signaler)\.?$/,
  /^aucune\s+action(?:\s+(?:requise|n[ée]cessaire))?\.?$/,
  /^t[âa]che\s+(?:termin[ée]e|accomplie|finie)\.?$/,
  /^(?:termin[ée]|fait|ok|done|rien|empty|nothing(?:\s+to\s+do)?)\.?$/,
  /^no\s+action(?:\s+needed)?\.?$/,
  /^empty\s+(?:directory|folder)\.?$/,
];

/** Vrai si le texte n'apporte aucun contenu propre : trop court, ou uniquement une formule méta
 *  (« dossier vide », « rien à faire », « tâche terminée »…). */
export function isMetaSummary(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized.length < META_SUMMARY_MIN_LENGTH) return true;
  return META_SUMMARY_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Un livrable est valide s'il existe au moins : un commentaire d'agent non-méta, une ressource
 *  liée au run, un résumé non-méta, ou un lien externe (PR/URL) déclaré dans le résumé. */
export function hasValidDeliverable(input: {
  summary: string | null;
  comments: readonly { content: string; authorType: string }[];
  resources: readonly { id: string }[];
}): boolean {
  if (
    input.comments.some(
      (comment) =>
        comment.authorType === "agent" && !isMetaSummary(comment.content),
    )
  ) {
    return true;
  }
  if (input.resources.length > 0) return true;
  if (input.summary) {
    if (/\bhttps?:\/\/\S+/i.test(input.summary)) return true;
    if (!isMetaSummary(input.summary)) return true;
  }
  return false;
}

/** Les branches du contrat « Définition de livré » (V1 §3). Un run `succeeded` n'implique jamais
 *  `done` : il faut un livrable, et l'humain reste l'autorité quand la revue est requise. */
export function resolveDeliveryOutcome(input: {
  runStatus: WorkRunStatus;
  reviewPolicy: WorkReviewPolicy;
  hasDeliverable: boolean;
  agentBlocker: boolean;
  /** Le run s'est terminé alors que des délégations tournaient encore : leur travail a été
   *  interrompu, donc ce qu'elles devaient produire manque, quoi que dise le résumé. */
  abandonedDelegations?: boolean;
}): {
  status: WorkItemStatus;
  reason?: "no_deliverable" | "agent_blocker" | "abandoned_delegations";
} {
  if (input.runStatus === "cancelled") return { status: "cancelled" };
  if (input.agentBlocker) {
    return { status: "blocked", reason: "agent_blocker" };
  }
  if (input.runStatus !== "succeeded") return { status: "blocked" };
  if (!input.hasDeliverable) {
    return { status: "blocked", reason: "no_deliverable" };
  }
  if (input.abandonedDelegations) {
    return { status: "blocked", reason: "abandoned_delegations" };
  }
  if (input.reviewPolicy === "required") return { status: "review" };
  return { status: "done" };
}

/** Porte avant mise en file : pas de run sans matière. Refuse si la description est vide ET
 *  qu'aucune ressource n'est liée ET qu'aucun projet ne fournit de ressources. */
export function assertRunnableBrief(input: {
  description: string;
  linkedResourceCount: number;
  projectResourceCount: number;
}): void {
  const hasBrief = input.description.trim().length > 0;
  if (
    !hasBrief &&
    input.linkedResourceCount === 0 &&
    input.projectResourceCount === 0
  ) {
    throw new WorkDomainError(
      "missing_brief",
      "Pas de matière pour lancer un run : ajoute une description, une ressource liée ou un projet avec des ressources.",
    );
  }
}

/** Projection live « est-ce que Hermes travaille ? », dérivée des runs — affichée en badge sur la
 *  carte, jamais en colonne kanban (V1 §3, axe B). */
export type WorkExecutionState =
  | "idle"
  | "queued"
  | "running"
  | "waiting_input"
  | "succeeded"
  | "failed";

export function deriveWorkExecutionState(input: {
  activeRunCount: number;
  latestRunStatus: WorkRunStatus | null;
}): WorkExecutionState {
  if (input.activeRunCount > 0) {
    switch (input.latestRunStatus) {
      case "waiting_input":
        return "waiting_input";
      case "queued":
      case "preparing":
        return "queued";
      default:
        return "running";
    }
  }
  switch (input.latestRunStatus) {
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    default:
      return "idle";
  }
}
