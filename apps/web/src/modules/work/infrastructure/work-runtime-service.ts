import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  max,
  ne,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  agentSessions,
  agentTeamMembers,
  agentTeams,
  inboxItems,
  workInterventions,
  workItemComments,
  workItems,
  workRunEvents,
  workRunPlanRevisions,
  workRunPlanSteps,
  workRuns,
  workspaces,
  type WorkInterventionType,
  type WorkRun,
} from "@/db/schema";
import {
  assertWorkRunTransition,
  isRetryableWorkFailure,
  normalizeHermesTodo,
  redactWorkText,
  selectPlanDelegationMember,
  WorkDomainError,
} from "@/modules/work/domain/work";
import { workFeatureEnabled } from "@/modules/work/domain/work-flags";
import {
  enqueueWorkRun,
  WorkConflictError,
  WorkNotFoundError,
} from "./work-service";
import { readEphemeralInterventionValue } from "./ephemeral-interventions";

const DEFAULT_LEASE_MS = 30_000;
const MAX_EVENT_BATCH = 100;
const MAX_EVENT_PAYLOAD_BYTES = 256_000;

function leaseHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function newLease() {
  return randomBytes(32).toString("base64url");
}

function safeJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string") return redactWorkText(value).slice(0, 50_000);
  if (typeof value === "number" || typeof value === "boolean" || value === null)
    return value;
  if (Array.isArray(value))
    return value.slice(0, 256).map((item) => safeJsonValue(item, depth + 1));
  if (!value || typeof value !== "object") return null;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(
    value as Record<string, unknown>,
  ).slice(0, 128)) {
    if (/^(password|secret|token|authorization|api[_-]?key)$/i.test(key)) {
      output[key] = "[REDACTED]";
    } else if (
      key === "reasoning" ||
      key === "thinking" ||
      key === "args_text" ||
      key === "result_text"
    ) {
      continue;
    } else {
      output[key] = safeJsonValue(child, depth + 1);
    }
  }
  return output;
}

export function sanitizeWorkEventPayload(type: string, value: unknown) {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  if (
    type === "reasoning.delta" ||
    type === "thinking.delta" ||
    type === "message.delta"
  )
    return {};
  if (type === "tool.complete") {
    return safeJsonValue({
      tool_id: source.tool_id,
      name: source.name,
      summary: source.summary,
      todos: source.name === "todo" ? source.todos : undefined,
      duration_s: source.duration_s,
    }) as Record<string, unknown>;
  }
  if (type === "tool.start" || type === "tool.progress") {
    return safeJsonValue({
      tool_id: source.tool_id,
      name: source.name,
      context: source.context,
      preview: source.preview,
    }) as Record<string, unknown>;
  }
  if (type.startsWith("subagent.")) {
    return safeJsonValue({
      subagent_id: source.subagent_id,
      parent_id: source.parent_id,
      child_session_id: source.child_session_id,
      goal: source.goal,
      task_count: source.task_count,
      task_index: source.task_index,
      depth: source.depth,
      model: source.model,
      status: source.status,
      summary: source.summary,
      duration_seconds: source.duration_seconds,
      input_tokens: source.input_tokens,
      output_tokens: source.output_tokens,
      reasoning_tokens: source.reasoning_tokens,
      api_calls: source.api_calls,
    }) as Record<string, unknown>;
  }
  return safeJsonValue(source) as Record<string, unknown>;
}

export type RuntimeWorkEventInput = {
  sequence: number;
  type: string;
  payload?: Record<string, unknown>;
  occurredAt: string;
  visibility?: "workspace" | "internal";
};

async function appendRunEvent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  runId: string,
  event: RuntimeWorkEventInput,
) {
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) {
    throw new WorkDomainError(
      "invalid_event_sequence",
      "Séquence d’événement invalide.",
    );
  }
  const payload = sanitizeWorkEventPayload(event.type, event.payload);
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_EVENT_PAYLOAD_BYTES) {
    throw new WorkDomainError(
      "event_too_large",
      "Événement Work trop volumineux.",
    );
  }
  const [inserted] = await tx
    .insert(workRunEvents)
    .values({
      runId,
      sequence: event.sequence,
      type: event.type,
      payload,
      visibility: event.visibility ?? "workspace",
      occurredAt: new Date(event.occurredAt),
    })
    .onConflictDoNothing()
    .returning();
  return inserted ?? null;
}

async function nextEventSequence(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  runId: string,
) {
  const [{ value }] = await tx
    .select({ value: max(workRunEvents.sequence) })
    .from(workRunEvents)
    .where(eq(workRunEvents.runId, runId));
  return Number(value ?? 0) + 1;
}

async function persistPlanSnapshot(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  runId: string,
  sourceEventSequence: number,
  todos: unknown,
) {
  const plan = normalizeHermesTodo(todos);
  const existingRevision = await tx
    .select({ id: workRunPlanRevisions.id })
    .from(workRunPlanRevisions)
    .where(
      and(
        eq(workRunPlanRevisions.runId, runId),
        eq(workRunPlanRevisions.sourceEventSequence, sourceEventSequence),
      ),
    )
    .limit(1);
  if (existingRevision[0])
    return {
      revisionId: existingRevision[0].id,
      diagnostics: plan.diagnostics,
    };

  const [{ value }] = await tx
    .select({ value: max(workRunPlanRevisions.sequence) })
    .from(workRunPlanRevisions)
    .where(eq(workRunPlanRevisions.runId, runId));
  const [revision] = await tx
    .insert(workRunPlanRevisions)
    .values({
      runId,
      sequence: Number(value ?? 0) + 1,
      sourceEventSequence,
      itemsSnapshot: plan.items,
      activeStepId: plan.activeStepId,
      diagnostics: plan.diagnostics,
    })
    .returning();

  const existingSteps = await tx
    .select()
    .from(workRunPlanSteps)
    .where(eq(workRunPlanSteps.runId, runId));
  const nextIds = new Set(plan.items.map((item) => item.id));
  const now = new Date();
  for (const [position, item] of plan.items.entries()) {
    const previous = existingSteps.find(
      (step) => step.hermesStepId === item.id,
    );
    await tx
      .insert(workRunPlanSteps)
      .values({
        runId,
        hermesStepId: item.id,
        position,
        content: item.content,
        status: item.status,
        firstSeenRevisionId: previous?.firstSeenRevisionId ?? revision.id,
        lastSeenRevisionId: revision.id,
        startedAt:
          item.status === "in_progress"
            ? (previous?.startedAt ?? now)
            : previous?.startedAt,
        completedAt:
          item.status === "completed" ? (previous?.completedAt ?? now) : null,
        cancelledAt:
          item.status === "cancelled" ? (previous?.cancelledAt ?? now) : null,
      })
      .onConflictDoUpdate({
        target: [workRunPlanSteps.runId, workRunPlanSteps.hermesStepId],
        set: {
          position,
          content: item.content,
          status: item.status,
          lastSeenRevisionId: revision.id,
          startedAt:
            item.status === "in_progress"
              ? (previous?.startedAt ?? now)
              : previous?.startedAt,
          completedAt:
            item.status === "completed" ? (previous?.completedAt ?? now) : null,
          cancelledAt:
            item.status === "cancelled" ? (previous?.cancelledAt ?? now) : null,
          updatedAt: now,
        },
      });
  }
  for (const removed of existingSteps.filter(
    (step) => !nextIds.has(step.hermesStepId),
  )) {
    await tx
      .update(workRunPlanSteps)
      .set({
        status:
          removed.status === "pending" || removed.status === "in_progress"
            ? "cancelled"
            : removed.status,
        lastSeenRevisionId: revision.id,
        cancelledAt:
          removed.status === "pending" || removed.status === "in_progress"
            ? now
            : removed.cancelledAt,
        updatedAt: now,
      })
      .where(eq(workRunPlanSteps.id, removed.id));
  }
  return { revisionId: revision.id, diagnostics: plan.diagnostics };
}

async function autoDelegateTeamPlanSteps(parentRunId: string) {
  const [scope] = await db
    .select({
      runId: workRuns.id,
      workItemId: workRuns.workItemId,
      workspaceId: workRuns.workspaceId,
      originatorUserId: workRuns.originatorUserId,
      parentRunId: workRuns.parentRunId,
      teamId: agentTeams.id,
      teamName: agentTeams.name,
      leadAgentId: agentTeams.leadAgentId,
      concurrencyLimit: agentTeams.concurrencyLimit,
      delegationPolicy: agentTeams.delegationPolicy,
      workspaceSlug: workspaces.slug,
      tenantId: workspaces.tenantId,
    })
    .from(workRuns)
    .innerJoin(workItems, eq(workItems.id, workRuns.workItemId))
    .innerJoin(workspaces, eq(workspaces.id, workRuns.workspaceId))
    .innerJoin(agentTeams, eq(agentTeams.id, workItems.assigneeTeamId))
    .where(
      and(
        eq(workRuns.id, parentRunId),
        isNull(workRuns.parentRunId),
        isNull(agentTeams.archivedAt),
      ),
    )
    .limit(1);
  if (!scope) return [];
  const policy = scope.delegationPolicy as {
    autoDelegatePlanSteps?: boolean;
  };
  if (policy.autoDelegatePlanSteps !== true) return [];

  const [members, steps] = await Promise.all([
    db
      .select({
        id: agents.id,
        name: agents.name,
        slug: agents.slug,
        profile: agents.hermesProfileName,
      })
      .from(agentTeamMembers)
      .innerJoin(agents, eq(agents.id, agentTeamMembers.agentId))
      .where(
        and(
          eq(agentTeamMembers.teamId, scope.teamId),
          ne(agents.id, scope.leadAgentId),
          eq(agents.runtimeState, "ready"),
          isNotNull(agents.runtimeInstallationId),
        ),
      )
      .orderBy(asc(agentTeamMembers.createdAt), asc(agents.id)),
    db
      .select()
      .from(workRunPlanSteps)
      .where(
        and(
          eq(workRunPlanSteps.runId, parentRunId),
          eq(workRunPlanSteps.status, "pending"),
          isNull(workRunPlanSteps.delegatedRunId),
        ),
      )
      .orderBy(asc(workRunPlanSteps.position)),
  ]);
  if (!members.length || !steps.length) return [];

  const delegated = [];
  for (const step of steps) {
    const member = selectPlanDelegationMember(members, step.position);
    if (!member) continue;
    try {
      const result = await enqueueWorkRun({
        context: {
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          workspaceSlug: scope.workspaceSlug,
          userId: scope.originatorUserId,
          role: "member",
        },
        workItemId: scope.workItemId,
        triggerType: "delegation",
        parentRunId,
        forceAgentId: member.id,
        idempotencyKey: `plan-delegation:${parentRunId}:${step.id}:${member.id}`,
        promptOverride: [
          `Tu exécutes une étape déléguée par le lead de l’équipe ${scope.teamName}.`,
          `Étape : ${step.content}`,
          "",
          "Traite uniquement cette étape de façon autonome et vérifiable.",
          "Produis un résultat concis destiné au run parent Hermes Console.",
        ].join("\n"),
        contextPatch: {
          team: {
            id: scope.teamId,
            name: scope.teamName,
            leadAgentId: scope.leadAgentId,
            concurrencyLimit: scope.concurrencyLimit,
          },
          delegatedPlanStep: {
            id: step.id,
            hermesStepId: step.hermesStepId,
            position: step.position,
            content: step.content,
            parentRunId,
          },
        },
      });
      await db
        .update(workRunPlanSteps)
        .set({ delegatedRunId: result.run.id, updatedAt: new Date() })
        .where(
          and(
            eq(workRunPlanSteps.id, step.id),
            isNull(workRunPlanSteps.delegatedRunId),
          ),
        );
      delegated.push(result.run);
    } catch {
      // The lead plan must remain durable even when a member is temporarily
      // unavailable or a budget policy refuses a child run. A later snapshot
      // retries the same deterministic delegation key.
    }
  }
  return delegated;
}

function delegatedEventIdentity(payload: Record<string, unknown> | undefined) {
  const value = String(
    payload?.subagent_id ?? payload?.child_session_id ?? "",
  ).trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/.test(value) ? value : null;
}

async function projectDelegatedRunEvent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  parentRunId: string,
  event: RuntimeWorkEventInput,
) {
  const identity = delegatedEventIdentity(event.payload);
  if (!identity) return;
  const idempotencyKey = `delegation:${parentRunId}:${identity}`;
  if (event.type === "subagent.start") {
    const [parent] = await tx
      .select()
      .from(workRuns)
      .where(eq(workRuns.id, parentRunId))
      .limit(1);
    if (!parent) return;
    const childSessionId =
      String(event.payload?.child_session_id ?? "")
        .trim()
        .slice(0, 512) || null;
    const [session] = childSessionId
      ? await tx
          .insert(agentSessions)
          .values({
            agentId: parent.agentId,
            hermesSessionId: childSessionId,
            title: redactWorkText(
              String(event.payload?.goal ?? "Délégation Hermes"),
            ).slice(0, 240),
            createdByUserId: parent.originatorUserId,
            lastActivityAt: new Date(event.occurredAt),
          })
          .onConflictDoUpdate({
            target: [agentSessions.agentId, agentSessions.hermesSessionId],
            set: { lastActivityAt: new Date(event.occurredAt) },
          })
          .returning()
      : [];
    await tx
      .insert(workRuns)
      .values({
        workItemId: parent.workItemId,
        workspaceId: parent.workspaceId,
        agentId: parent.agentId,
        runtimeInstallationId: parent.runtimeInstallationId,
        hermesProfileName: parent.hermesProfileName,
        triggerType: "delegation",
        originatorUserId: parent.originatorUserId,
        parentRunId: parent.id,
        status: "running",
        attempt: 1,
        maxAttempts: 1,
        agentSessionId: session?.id ?? null,
        hermesSessionId: childSessionId,
        prompt: redactWorkText(
          String(event.payload?.goal ?? "Délégation Hermes"),
        ).slice(0, 20_000),
        contextSnapshot: {
          syntheticDelegation: true,
          subagentId: identity,
          parentRunId: parent.id,
        },
        idempotencyKey,
        claimedAt: new Date(event.occurredAt),
        startedAt: new Date(event.occurredAt),
        lastHeartbeatAt: new Date(event.occurredAt),
      })
      .onConflictDoNothing({
        target: [workRuns.workspaceId, workRuns.idempotencyKey],
      });
    return;
  }
  if (event.type === "subagent.complete") {
    const rawStatus = String(event.payload?.status ?? "").toLowerCase();
    const status =
      rawStatus === "failed" || rawStatus === "error"
        ? "failed"
        : rawStatus === "cancelled"
          ? "cancelled"
          : "succeeded";
    await tx
      .update(workRuns)
      .set({
        status,
        resultSummary:
          redactWorkText(String(event.payload?.summary ?? "")).slice(
            0,
            100_000,
          ) || null,
        failureReason: status === "failed" ? "delegated_subagent_failed" : null,
        usage: safeJsonValue({
          input_tokens: event.payload?.input_tokens,
          output_tokens: event.payload?.output_tokens,
          reasoning_tokens: event.payload?.reasoning_tokens,
          api_calls: event.payload?.api_calls,
        }) as Record<string, unknown>,
        lastHeartbeatAt: new Date(event.occurredAt),
        completedAt: new Date(event.occurredAt),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workRuns.parentRunId, parentRunId),
          eq(workRuns.idempotencyKey, idempotencyKey),
        ),
      );
  }
}

async function requireLease(
  runId: string,
  installationId: string,
  leaseToken: string,
) {
  const [run] = await db
    .select()
    .from(workRuns)
    .where(
      and(
        eq(workRuns.id, runId),
        eq(workRuns.runtimeInstallationId, installationId),
      ),
    )
    .limit(1);
  if (!run) throw new WorkNotFoundError("Run introuvable.");
  if (
    !run.leaseTokenHash ||
    run.leaseTokenHash !== leaseHash(leaseToken) ||
    !run.leaseExpiresAt ||
    run.leaseExpiresAt <= new Date()
  ) {
    throw new WorkConflictError("Lease expirée ou invalide.");
  }
  return run;
}

export async function claimWorkRuns(input: {
  installationId: string;
  edgeId: string;
  capacity: number;
  leaseMs?: number;
}) {
  const capacity = Math.min(Math.max(Math.trunc(input.capacity), 1), 16);
  const leaseMs = Math.min(
    Math.max(input.leaseMs ?? DEFAULT_LEASE_MS, 10_000),
    120_000,
  );
  return db.transaction(async (tx) => {
    const exhausted = await tx.execute<{
      id: string;
      work_item_id: string;
    }>(sql`
      UPDATE work_runs
      SET status = 'failed',
          claimed_by_edge_id = NULL,
          lease_token_hash = NULL,
          lease_expires_at = NULL,
          failure_reason = 'lease_expired',
          completed_at = now(),
          updated_at = now()
      WHERE runtime_installation_id = ${input.installationId}
        AND status IN ('preparing', 'running', 'waiting_input')
        AND lease_expires_at < now()
        AND attempt >= max_attempts
      RETURNING id, work_item_id
    `);
    if (exhausted.length) {
      await tx
        .update(workItems)
        .set({ status: "blocked", updatedAt: new Date() })
        .where(
          inArray(
            workItems.id,
            exhausted.map((row) => row.work_item_id),
          ),
        );
      for (const row of exhausted) {
        await appendRunEvent(tx, row.id, {
          sequence: await nextEventSequence(tx, row.id),
          type: "run.failed",
          payload: { reason: "lease_expired", retriesExhausted: true },
          occurredAt: new Date().toISOString(),
        });
      }
    }
    const expired = await tx.execute<{ id: string }>(sql`
      UPDATE work_runs
      SET status = 'queued',
          attempt = attempt + 1,
          claimed_by_edge_id = NULL,
          lease_token_hash = NULL,
          lease_expires_at = NULL,
          failure_reason = 'lease_expired',
          queued_at = now(),
          updated_at = now()
      WHERE runtime_installation_id = ${input.installationId}
        AND status IN ('preparing', 'running', 'waiting_input')
        AND lease_expires_at < now()
        AND attempt < max_attempts
      RETURNING id
    `);
    for (const row of expired) {
      await appendRunEvent(tx, row.id, {
        sequence: await nextEventSequence(tx, row.id),
        type: "run.requeued",
        payload: { reason: "lease_expired" },
        occurredAt: new Date().toISOString(),
      });
    }

    const candidates = await tx.execute<{
      id: string;
      hermes_profile_name: string;
      context_snapshot: Record<string, unknown>;
    }>(sql`
      SELECT candidate.id, candidate.hermes_profile_name, candidate.context_snapshot
      FROM work_runs candidate
      WHERE candidate.runtime_installation_id = ${input.installationId}
        AND candidate.status = 'queued'
        AND NOT EXISTS (
          SELECT 1
          FROM work_runs active
          WHERE active.runtime_installation_id = candidate.runtime_installation_id
            AND active.hermes_profile_name = candidate.hermes_profile_name
            AND active.status IN ('preparing', 'running', 'waiting_input', 'cancelling')
        )
      ORDER BY candidate.queued_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${capacity * 8}
    `);
    const claimed: Array<{
      run: WorkRun;
      leaseToken: string;
      nextEventSequence: number;
    }> = [];
    for (const candidate of candidates) {
      if (claimed.length >= capacity) break;
      const [profileLock] = await tx.execute<{ locked: boolean }>(sql`
        SELECT pg_try_advisory_xact_lock(
          hashtext(${input.installationId}),
          hashtext(${candidate.hermes_profile_name})
        ) AS locked
      `);
      if (!profileLock?.locked) continue;
      const activeProfile = await tx
        .select({ id: workRuns.id })
        .from(workRuns)
        .where(
          and(
            eq(workRuns.runtimeInstallationId, input.installationId),
            eq(workRuns.hermesProfileName, candidate.hermes_profile_name),
            inArray(workRuns.status, [
              "preparing",
              "running",
              "waiting_input",
              "cancelling",
            ]),
          ),
        )
        .limit(1);
      if (activeProfile[0]) continue;
      const teamContext =
        candidate.context_snapshot &&
        typeof candidate.context_snapshot.team === "object" &&
        candidate.context_snapshot.team
          ? (candidate.context_snapshot.team as Record<string, unknown>)
          : null;
      const teamId =
        typeof teamContext?.id === "string" ? teamContext.id : null;
      const teamLimit = Number(teamContext?.concurrencyLimit);
      if (teamId && Number.isSafeInteger(teamLimit) && teamLimit > 0) {
        const [{ value: activeTeamRuns }] = await tx
          .select({ value: sql<number>`count(*)::int` })
          .from(workRuns)
          .where(
            and(
              sql`${workRuns.contextSnapshot}->'team'->>'id' = ${teamId}`,
              inArray(workRuns.status, [
                "preparing",
                "running",
                "waiting_input",
                "cancelling",
              ]),
            ),
          );
        if (Number(activeTeamRuns ?? 0) >= teamLimit) continue;
      }
      const token = newLease();
      const now = new Date();
      const [run] = await tx
        .update(workRuns)
        .set({
          status: "preparing",
          claimedByEdgeId: input.edgeId,
          leaseTokenHash: leaseHash(token),
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
          claimedAt: now,
          lastHeartbeatAt: now,
          updatedAt: now,
        })
        .where(
          and(eq(workRuns.id, candidate.id), eq(workRuns.status, "queued")),
        )
        .returning();
      if (!run) continue;
      const sequence = await nextEventSequence(tx, run.id);
      await appendRunEvent(tx, run.id, {
        sequence,
        type: "run.claimed",
        payload: { edgeId: input.edgeId, attempt: run.attempt },
        occurredAt: now.toISOString(),
      });
      claimed.push({ run, leaseToken: token, nextEventSequence: sequence + 1 });
    }
    if (!claimed.length) return [];
    const itemRows = await tx
      .select()
      .from(workItems)
      .where(
        inArray(
          workItems.id,
          claimed.map(({ run }) => run.workItemId),
        ),
      );
    return claimed.map(({ run, leaseToken, nextEventSequence }) => ({
      runId: run.id,
      installationId: run.runtimeInstallationId,
      workItemId: run.workItemId,
      workspaceId: run.workspaceId,
      agentId: run.agentId,
      profile: run.hermesProfileName,
      prompt: run.prompt,
      context: run.contextSnapshot,
      attempt: run.attempt,
      resumeSessionId: run.hermesSessionId,
      leaseToken,
      leaseExpiresAt: run.leaseExpiresAt!.toISOString(),
      nextEventSequence,
      title:
        itemRows.find((item) => item.id === run.workItemId)?.title ??
        "Tâche Hermes Console",
    }));
  });
}

export async function startWorkRun(input: {
  runId: string;
  installationId: string;
  leaseToken: string;
  hermesSessionId: string;
}) {
  const run = await requireLease(
    input.runId,
    input.installationId,
    input.leaseToken,
  );
  assertWorkRunTransition(run.status, "running");
  const now = new Date();
  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(agentSessions)
      .values({
        agentId: run.agentId,
        hermesSessionId: input.hermesSessionId,
        title: `Travail ${run.workItemId}`,
        createdByUserId: run.originatorUserId,
        lastActivityAt: now,
      })
      .onConflictDoUpdate({
        target: [agentSessions.agentId, agentSessions.hermesSessionId],
        set: { lastActivityAt: now },
      })
      .returning();
    const [updated] = await tx
      .update(workRuns)
      .set({
        status: "running",
        agentSessionId: session.id,
        hermesSessionId: input.hermesSessionId,
        startedAt: run.startedAt ?? now,
        lastHeartbeatAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(workRuns.id, run.id),
          eq(workRuns.leaseTokenHash, leaseHash(input.leaseToken)),
        ),
      )
      .returning();
    await tx
      .update(workItems)
      .set({ status: "in_progress", updatedAt: now })
      .where(eq(workItems.id, run.workItemId));
    const sequence = await nextEventSequence(tx, run.id);
    await appendRunEvent(tx, run.id, {
      sequence,
      type: "run.started",
      payload: { hermesSessionId: input.hermesSessionId },
      occurredAt: now.toISOString(),
    });
    return { run: updated, nextEventSequence: sequence + 1 };
  });
}

export async function heartbeatWorkRun(input: {
  runId: string;
  installationId: string;
  leaseToken: string;
  leaseMs?: number;
}) {
  const run = await requireLease(
    input.runId,
    input.installationId,
    input.leaseToken,
  );
  const leaseMs = Math.min(
    Math.max(input.leaseMs ?? DEFAULT_LEASE_MS, 10_000),
    120_000,
  );
  const now = new Date();
  let [updated] = await db
    .update(workRuns)
    .set({
      leaseExpiresAt: new Date(now.getTime() + leaseMs),
      lastHeartbeatAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(workRuns.id, run.id),
        eq(workRuns.leaseTokenHash, leaseHash(input.leaseToken)),
      ),
    )
    .returning();
  const decisions = await db
    .select()
    .from(workInterventions)
    .where(
      and(
        eq(workInterventions.runId, run.id),
        isNotNull(workInterventions.decidedAt),
      ),
    )
    .orderBy(asc(workInterventions.decidedAt));
  const pending = await db
    .select({ id: workInterventions.id })
    .from(workInterventions)
    .where(
      and(
        eq(workInterventions.runId, run.id),
        eq(workInterventions.status, "pending"),
      ),
    )
    .limit(1);
  if (updated.status === "waiting_input" && !pending[0] && decisions.length) {
    [updated] = await db
      .update(workRuns)
      .set({ status: "running", updatedAt: now })
      .where(
        and(
          eq(workRuns.id, run.id),
          eq(workRuns.leaseTokenHash, leaseHash(input.leaseToken)),
        ),
      )
      .returning();
  }
  return {
    run: updated,
    commands: [
      ...(updated.status === "cancelling" ? [{ type: "cancel" as const }] : []),
      ...decisions.flatMap((decision) => {
        const ephemeralValue =
          decision.type === "secret" || decision.type === "sudo"
            ? readEphemeralInterventionValue(decision.id)
            : null;
        if (
          (decision.type === "secret" || decision.type === "sudo") &&
          !ephemeralValue
        )
          return [];
        return [
          {
            type: "intervention_response" as const,
            interventionId: decision.id,
            requestId: decision.hermesRequestId,
            interventionType: decision.type,
            decision: decision.status,
            payload: ephemeralValue
              ? { value: ephemeralValue }
              : decision.safePayload,
          },
        ];
      }),
    ],
  };
}

export async function appendWorkRunEvents(input: {
  runId: string;
  installationId: string;
  leaseToken: string;
  events: RuntimeWorkEventInput[];
}) {
  await requireLease(input.runId, input.installationId, input.leaseToken);
  if (!input.events.length || input.events.length > MAX_EVENT_BATCH) {
    throw new WorkDomainError(
      "invalid_event_batch",
      `Un batch doit contenir entre 1 et ${MAX_EVENT_BATCH} événements.`,
    );
  }
  for (let index = 1; index < input.events.length; index += 1) {
    if (input.events[index].sequence <= input.events[index - 1].sequence) {
      throw new WorkDomainError(
        "unordered_event_batch",
        "Les événements doivent être strictement ordonnés.",
      );
    }
  }
  const result = await db.transaction(async (tx) => {
    const accepted: number[] = [];
    for (const event of input.events) {
      if (
        event.type === "reasoning.delta" ||
        event.type === "thinking.delta" ||
        event.type === "message.delta"
      )
        continue;
      const inserted = await appendRunEvent(tx, input.runId, event);
      if (!inserted) continue;
      accepted.push(event.sequence);
      if (
        workFeatureEnabled("WORK_RUN_PLANS_ENABLED") &&
        event.type === "tool.complete" &&
        event.payload?.name === "todo" &&
        Array.isArray(event.payload.todos)
      ) {
        await persistPlanSnapshot(
          tx,
          input.runId,
          event.sequence,
          event.payload.todos,
        );
      }
      if (
        event.type === "subagent.start" ||
        event.type === "subagent.complete"
      ) {
        await projectDelegatedRunEvent(tx, input.runId, event);
      }
    }
    await tx
      .update(workRuns)
      .set({ lastHeartbeatAt: new Date(), updatedAt: new Date() })
      .where(eq(workRuns.id, input.runId));
    return { accepted };
  });
  if (
    input.events.some(
      (event) =>
        result.accepted.includes(event.sequence) &&
        event.type === "tool.complete" &&
        event.payload?.name === "todo",
    )
  ) {
    await autoDelegateTeamPlanSteps(input.runId);
  }
  return result;
}

export async function createWorkIntervention(input: {
  runId: string;
  installationId: string;
  leaseToken: string;
  requestId: string;
  type: WorkInterventionType;
  prompt: string;
  safePayload?: Record<string, unknown>;
  expiresAt?: Date | null;
}) {
  if (!workFeatureEnabled("WORK_INTERVENTIONS_ENABLED")) {
    throw new WorkDomainError(
      "work_interventions_disabled",
      "Les interventions Travail sont désactivées.",
    );
  }
  const run = await requireLease(
    input.runId,
    input.installationId,
    input.leaseToken,
  );
  const prompt = redactWorkText(input.prompt).slice(0, 20_000);
  if (!prompt)
    throw new WorkDomainError(
      "invalid_intervention",
      "Question d’intervention vide.",
    );
  return db.transaction(async (tx) => {
    const [intervention] = await tx
      .insert(workInterventions)
      .values({
        workspaceId: run.workspaceId,
        workItemId: run.workItemId,
        runId: run.id,
        agentId: run.agentId,
        agentSessionId: run.agentSessionId,
        hermesRequestId: input.requestId,
        type: input.type,
        prompt,
        safePayload:
          input.type === "secret" || input.type === "sudo"
            ? {}
            : (safeJsonValue(input.safePayload ?? {}) as Record<
                string,
                unknown
              >),
        expiresAt: input.expiresAt,
      })
      .onConflictDoUpdate({
        target: [workInterventions.runId, workInterventions.hermesRequestId],
        set: {
          prompt,
          safePayload:
            input.type === "secret" || input.type === "sudo"
              ? {}
              : (safeJsonValue(input.safePayload ?? {}) as Record<
                  string,
                  unknown
                >),
        },
      })
      .returning();
    await tx
      .update(workRuns)
      .set({ status: "waiting_input", updatedAt: new Date() })
      .where(eq(workRuns.id, run.id));
    const recipients = await workspaceAttentionUsers(tx, run.workspaceId);
    if (recipients.length) {
      await tx
        .insert(inboxItems)
        .values(
          recipients.map((userId) => ({
            workspaceId: run.workspaceId,
            userId,
            type: "work_intervention",
            sourceType: "work_intervention",
            sourceId: intervention.id,
            reason: `Une intervention ${input.type} requiert votre attention.`,
          })),
        )
        .onConflictDoNothing();
    }
    return intervention;
  });
}

async function workspaceAttentionUsers(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  workspaceId: string,
) {
  const result = await tx.execute<{ user_id: string }>(sql`
    SELECT DISTINCT actor.user_id
    FROM (
      SELECT tenant.owner_user_id AS user_id
      FROM workspaces workspace
      INNER JOIN tenants tenant ON tenant.id = workspace.tenant_id
      WHERE workspace.id = ${workspaceId}
      UNION
      SELECT membership.user_id
      FROM workspaces workspace
      INNER JOIN tenant_memberships membership ON membership.tenant_id = workspace.tenant_id
      WHERE workspace.id = ${workspaceId} AND membership.role IN ('owner', 'member')
    ) actor
  `);
  return result.map((row) => row.user_id);
}

export async function completeWorkRun(input: {
  runId: string;
  installationId: string;
  leaseToken: string;
  status: "succeeded" | "failed" | "cancelled";
  resultSummary?: string | null;
  failureReason?: string | null;
  usage?: Record<string, unknown> | null;
  costMicros?: number | null;
}) {
  const run = await requireLease(
    input.runId,
    input.installationId,
    input.leaseToken,
  );
  if (run.status === "cancelling" && input.status !== "cancelled") {
    throw new WorkConflictError(
      "Un run en annulation doit se terminer avec le statut cancelled.",
    );
  }
  if (run.status !== "cancelling")
    assertWorkRunTransition(run.status, input.status);
  const now = new Date();
  if (
    input.status === "failed" &&
    run.status !== "cancelling" &&
    run.attempt < run.maxAttempts &&
    isRetryableWorkFailure(input.failureReason)
  ) {
    return db.transaction(async (tx) => {
      const [requeued] = await tx
        .update(workRuns)
        .set({
          status: "queued",
          attempt: run.attempt + 1,
          failureReason:
            input.failureReason?.slice(0, 200) ?? "infrastructure_failure",
          claimedByEdgeId: null,
          leaseTokenHash: null,
          leaseExpiresAt: null,
          queuedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(workRuns.id, run.id),
            eq(workRuns.leaseTokenHash, leaseHash(input.leaseToken)),
          ),
        )
        .returning();
      await appendRunEvent(tx, run.id, {
        sequence: await nextEventSequence(tx, run.id),
        type: "run.retry_scheduled",
        payload: { reason: input.failureReason, attempt: requeued.attempt },
        occurredAt: now.toISOString(),
      });
      return requeued;
    });
  }
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(workRuns)
      .set({
        status: input.status,
        resultSummary: input.resultSummary
          ? redactWorkText(input.resultSummary).slice(0, 100_000)
          : null,
        failureReason: input.failureReason?.slice(0, 200) ?? null,
        usage: safeJsonValue(input.usage ?? null) as Record<
          string,
          unknown
        > | null,
        costMicros: input.costMicros,
        completedAt: now,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(workRuns.id, run.id),
          eq(workRuns.leaseTokenHash, leaseHash(input.leaseToken)),
        ),
      )
      .returning();
    if (!updated) throw new WorkConflictError("Le run a déjà été finalisé.");
    if (run.parentRunId) {
      if (input.resultSummary) {
        await tx.insert(workItemComments).values({
          workItemId: run.workItemId,
          authorType: "agent",
          authorAgentId: run.agentId,
          sourceRunId: run.id,
          content: redactWorkText(input.resultSummary).slice(0, 20_000),
        });
      }
      await appendRunEvent(tx, run.id, {
        sequence: await nextEventSequence(tx, run.id),
        type: `run.${input.status}`,
        payload: {
          failureReason: input.failureReason,
          parentRunId: run.parentRunId,
        },
        occurredAt: now.toISOString(),
      });
      if (input.status === "failed") {
        const recipients = await workspaceAttentionUsers(tx, run.workspaceId);
        if (recipients.length) {
          await tx
            .insert(inboxItems)
            .values(
              recipients.map((userId) => ({
                workspaceId: run.workspaceId,
                userId,
                type: "work_run_failed",
                sourceType: "work_run",
                sourceId: run.id,
                reason: "Une étape déléguée a échoué.",
              })),
            )
            .onConflictDoNothing();
        }
      }
      return updated;
    }
    await tx
      .update(workRuns)
      .set({
        status: input.status === "cancelled" ? "cancelled" : "failed",
        failureReason:
          input.status === "cancelled"
            ? "parent_cancelled"
            : "parent_run_finished_before_delegation",
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(workRuns.parentRunId, run.id),
          inArray(workRuns.status, [
            "queued",
            "preparing",
            "running",
            "waiting_input",
            "cancelling",
          ]),
        ),
      );
    const [item] = await tx
      .select()
      .from(workItems)
      .where(eq(workItems.id, run.workItemId))
      .limit(1);
    const itemStatus =
      input.status === "succeeded"
        ? item.reviewPolicy === "required"
          ? "review"
          : "done"
        : input.status === "cancelled"
          ? "cancelled"
          : "blocked";
    await tx
      .update(workItems)
      .set({
        status: itemStatus,
        completedAt: itemStatus === "done" ? now : null,
        cancelledAt: itemStatus === "cancelled" ? now : null,
        updatedAt: now,
      })
      .where(eq(workItems.id, item.id));
    if (input.resultSummary) {
      await tx.insert(workItemComments).values({
        workItemId: item.id,
        authorType: "agent",
        authorAgentId: run.agentId,
        sourceRunId: run.id,
        content: redactWorkText(input.resultSummary).slice(0, 20_000),
      });
    }
    await appendRunEvent(tx, run.id, {
      sequence: await nextEventSequence(tx, run.id),
      type: `run.${input.status}`,
      payload: { failureReason: input.failureReason },
      occurredAt: now.toISOString(),
    });
    if (input.status === "failed" || itemStatus === "review") {
      const recipients = await workspaceAttentionUsers(tx, run.workspaceId);
      if (recipients.length) {
        await tx
          .insert(inboxItems)
          .values(
            recipients.map((userId) => ({
              workspaceId: run.workspaceId,
              userId,
              type:
                input.status === "failed"
                  ? "work_run_failed"
                  : "deliverable_review",
              sourceType: "work_run",
              sourceId: run.id,
              reason:
                input.status === "failed"
                  ? `${item.key} a échoué.`
                  : `${item.key} est prête à relire.`,
            })),
          )
          .onConflictDoNothing();
      }
    }
    return updated;
  });
}

export async function releaseWorkRun(input: {
  runId: string;
  installationId: string;
  leaseToken: string;
  reason?: string;
}) {
  const run = await requireLease(
    input.runId,
    input.installationId,
    input.leaseToken,
  );
  if (run.status !== "preparing")
    throw new WorkConflictError("Seul un run non démarré peut être relâché.");
  const [updated] = await db
    .update(workRuns)
    .set({
      status: "queued",
      claimedByEdgeId: null,
      leaseTokenHash: null,
      leaseExpiresAt: null,
      failureReason: input.reason?.slice(0, 200) ?? null,
      queuedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workRuns.id, run.id),
        eq(workRuns.leaseTokenHash, leaseHash(input.leaseToken)),
      ),
    )
    .returning();
  return updated;
}
