import "server-only";

import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  max,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  agentTeamMembers,
  agentTeams,
  auditEvents,
  inboxItems,
  projects,
  runtimeBudgets,
  runtimeUsageSamples,
  workAutomations,
  workAutomationRuns,
  workInterventions,
  workItemComments,
  workItemDependencies,
  workItemLabelLinks,
  workItemLabels,
  workItems,
  workResources,
  workSavedViews,
  workRunEvents,
  workRunPlanRevisions,
  workRunPlanSteps,
  workRuns,
  type MembershipRole,
  type WorkAssigneeType,
  type WorkItemPriority,
  type WorkItemStatus,
  type WorkReviewPolicy,
  type WorkResourceKind,
  type WorkRunTrigger,
} from "@/db/schema";
import { evaluateInferenceBudget } from "@/lib/hermes/runtime-policy";
import {
  assertWorkItemTransition,
  validateAssignee,
  WorkDomainError,
  workItemKey,
  workRunTerminal,
} from "@/modules/work/domain/work";
import { workFeatureEnabled } from "@/modules/work/domain/work-flags";
import { rememberEphemeralInterventionValue } from "./ephemeral-interventions";

export type WorkContext = {
  tenantId: string;
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  role: MembershipRole;
};

type AssigneeInput = {
  type?: WorkAssigneeType | null;
  userId?: string | null;
  agentId?: string | null;
  teamId?: string | null;
};

export class WorkNotFoundError extends Error {}
export class WorkConflictError extends Error {}

function cleanText(value: string, maxLength: number, label: string) {
  const result = value.trim();
  if (!result || result.length > maxLength) {
    throw new WorkDomainError(
      "invalid_work_input",
      `${label} doit contenir entre 1 et ${maxLength} caractères.`,
    );
  }
  return result;
}

function workSlug(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return slug || `team-${randomUUID().slice(0, 8)}`;
}

async function validateWorkspaceReferences(
  workspaceId: string,
  input: AssigneeInput & {
    projectId?: string | null;
    parentWorkItemId?: string | null;
  },
) {
  validateAssignee(input);
  const checks: Promise<unknown>[] = [];
  if (input.userId) {
    // User workspace membership is evaluated by the route guard. User assignment
    // additionally requires a tenant membership, checked below without exposing data.
    checks.push(
      db
        .execute(
          sql`
      SELECT 1
      FROM workspaces workspace
      INNER JOIN tenants tenant ON tenant.id = workspace.tenant_id
      LEFT JOIN tenant_memberships membership
        ON membership.tenant_id = tenant.id AND membership.user_id = ${input.userId}
      WHERE workspace.id = ${workspaceId}
        AND (tenant.owner_user_id = ${input.userId} OR membership.user_id IS NOT NULL)
      LIMIT 1
    `,
        )
        .then((result) => {
          if (result.length === 0)
            throw new WorkDomainError(
              "invalid_assignee",
              "Utilisateur assigné hors workspace.",
            );
        }),
    );
  }
  if (input.agentId) {
    checks.push(
      db
        .select({ id: agents.id })
        .from(agents)
        .where(
          and(
            eq(agents.id, input.agentId),
            eq(agents.workspaceId, workspaceId),
          ),
        )
        .limit(1)
        .then((rows) => {
          if (!rows[0])
            throw new WorkDomainError(
              "invalid_assignee",
              "Agent assigné hors workspace.",
            );
        }),
    );
  }
  if (input.teamId) {
    checks.push(
      db
        .select({ id: agentTeams.id })
        .from(agentTeams)
        .where(
          and(
            eq(agentTeams.id, input.teamId),
            eq(agentTeams.workspaceId, workspaceId),
            isNull(agentTeams.archivedAt),
          ),
        )
        .limit(1)
        .then((rows) => {
          if (!rows[0])
            throw new WorkDomainError(
              "invalid_assignee",
              "Équipe assignée hors workspace.",
            );
        }),
    );
  }
  if (input.projectId) {
    checks.push(
      db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.workspaceId, workspaceId),
          ),
        )
        .limit(1)
        .then((rows) => {
          if (!rows[0])
            throw new WorkDomainError(
              "invalid_project",
              "Projet hors workspace.",
            );
        }),
    );
  }
  if (input.parentWorkItemId) {
    checks.push(
      db
        .select({ id: workItems.id })
        .from(workItems)
        .where(
          and(
            eq(workItems.id, input.parentWorkItemId),
            eq(workItems.workspaceId, workspaceId),
          ),
        )
        .limit(1)
        .then((rows) => {
          if (!rows[0])
            throw new WorkDomainError(
              "invalid_parent",
              "Tâche parente hors workspace.",
            );
        }),
    );
  }
  await Promise.all(checks);
}

function assigneeColumns(input: AssigneeInput) {
  return {
    assigneeType: input.type ?? null,
    assigneeUserId: input.type === "user" ? (input.userId ?? null) : null,
    assigneeAgentId: input.type === "agent" ? (input.agentId ?? null) : null,
    assigneeTeamId: input.type === "team" ? (input.teamId ?? null) : null,
  };
}

async function resolveExecutor(workspaceId: string, assignee: AssigneeInput) {
  const requestedAgentId =
    assignee.type === "agent"
      ? assignee.agentId
      : assignee.type === "team" && assignee.teamId
        ? await db
            .select({ agentId: agentTeams.leadAgentId })
            .from(agentTeams)
            .where(
              and(
                eq(agentTeams.id, assignee.teamId),
                eq(agentTeams.workspaceId, workspaceId),
                isNull(agentTeams.archivedAt),
              ),
            )
            .limit(1)
            .then((rows) => rows[0]?.agentId)
        : null;
  if (!requestedAgentId) return null;
  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.id, requestedAgentId), eq(agents.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!agent?.runtimeInstallationId || agent.runtimeState !== "ready") {
    throw new WorkConflictError(
      "L’agent assigné ne dispose pas d’un runtime prêt.",
    );
  }
  return agent;
}

type TeamExecutionContext = {
  id: string;
  name: string;
  concurrencyLimit: number;
  members: Array<{ name: string; slug: string; profile: string }>;
};

function buildRunPrompt(
  item: { key: string; title: string; description: string },
  team: TeamExecutionContext | null,
  resources: Array<{ name: string; kind: WorkResourceKind; uri: string }>,
) {
  return [
    `Tu exécutes la tâche ${item.key} dans Hermes Console.`,
    `Titre : ${item.title}`,
    "",
    item.description,
    "",
    ...(team
      ? [
          `Tu es le lead de l’équipe ${team.name}.`,
          `Membres configurés : ${team.members.map((member) => `${member.name} (@${member.slug}, profil ${member.profile})`).join(", ")}.`,
          "Si tu utilises delegate_task, donne à chaque sous-agent un objectif autonome et vérifiable. La Console projettera chaque branche en run enfant sans créer de tâche métier implicite.",
          "",
        ]
      : []),
    ...(resources.length
      ? [
          "Ressources autorisées pour cette tâche :",
          ...resources.map(
            (resource) =>
              `- ${resource.name} (${resource.kind}) : ${resource.uri}`,
          ),
          "",
        ]
      : []),
    "Pour tout travail multi-étapes, maintiens le plan avec l’outil todo : une seule étape in_progress, puis complète ou annule chaque étape.",
    "Produis un résultat final concis et mentionne les livrables créés.",
  ].join("\n");
}

export async function enqueueWorkRun(input: {
  context: WorkContext;
  workItemId: string;
  triggerType: WorkRunTrigger;
  idempotencyKey?: string;
  parentRunId?: string | null;
  forceAgentId?: string | null;
  triggerCommentId?: string | null;
  automationId?: string | null;
  promptOverride?: string | null;
  contextPatch?: Record<string, unknown>;
}) {
  if (
    !workFeatureEnabled("WORK_CONTROL_PLANE_ENABLED") ||
    !workFeatureEnabled("WORK_EDGE_EXECUTOR_ENABLED")
  ) {
    throw new WorkConflictError(
      "Les nouvelles exécutions Travail sont temporairement désactivées.",
    );
  }
  const [item] = await db
    .select()
    .from(workItems)
    .where(
      and(
        eq(workItems.id, input.workItemId),
        eq(workItems.workspaceId, input.context.workspaceId),
      ),
    )
    .limit(1);
  if (!item) throw new WorkNotFoundError("Tâche introuvable.");
  const idempotencyKey =
    input.idempotencyKey ?? `${input.triggerType}:${item.id}:${randomUUID()}`;
  const [existingRun] = await db
    .select()
    .from(workRuns)
    .where(
      and(
        eq(workRuns.workspaceId, input.context.workspaceId),
        eq(workRuns.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (existingRun) return { run: existingRun, created: false };
  const assignee: AssigneeInput = input.forceAgentId
    ? { type: "agent", agentId: input.forceAgentId }
    : {
        type: item.assigneeType,
        userId: item.assigneeUserId,
        agentId: item.assigneeAgentId,
        teamId: item.assigneeTeamId,
      };
  const agent = await resolveExecutor(input.context.workspaceId, assignee);
  if (!agent?.runtimeInstallationId)
    throw new WorkConflictError(
      "Cette tâche n’est pas assignée à un agent exécutable.",
    );
  const runtimeInstallationId = agent.runtimeInstallationId;
  let teamContext: TeamExecutionContext | null = null;
  if (assignee.type === "team" && assignee.teamId) {
    const [team] = await db
      .select()
      .from(agentTeams)
      .where(
        and(
          eq(agentTeams.id, assignee.teamId),
          eq(agentTeams.workspaceId, input.context.workspaceId),
          isNull(agentTeams.archivedAt),
        ),
      )
      .limit(1);
    if (!team)
      throw new WorkConflictError("L’équipe assignée n’est plus disponible.");
    const members = await db
      .select({
        name: agents.name,
        slug: agents.slug,
        profile: agents.hermesProfileName,
      })
      .from(agentTeamMembers)
      .innerJoin(agents, eq(agents.id, agentTeamMembers.agentId))
      .where(eq(agentTeamMembers.teamId, team.id));
    teamContext = {
      id: team.id,
      name: team.name,
      concurrencyLimit: team.concurrencyLimit,
      members,
    };
  }
  const [budget, usage, resources] = await Promise.all([
    db
      .select()
      .from(runtimeBudgets)
      .where(eq(runtimeBudgets.installationId, runtimeInstallationId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select()
      .from(runtimeUsageSamples)
      .where(eq(runtimeUsageSamples.installationId, runtimeInstallationId))
      .orderBy(desc(runtimeUsageSamples.sampledAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        name: workResources.name,
        kind: workResources.kind,
        uri: workResources.uri,
      })
      .from(workResources)
      .where(
        and(
          eq(workResources.workspaceId, input.context.workspaceId),
          or(
            eq(workResources.workItemId, item.id),
            item.projectId
              ? eq(workResources.projectId, item.projectId)
              : sql`false`,
          ),
        ),
      )
      .orderBy(asc(workResources.createdAt))
      .limit(100),
  ]);
  const budgetDecision = evaluateInferenceBudget(
    budget,
    usage,
    input.context.role,
  );
  if (!budgetDecision.allowed) {
    throw new WorkConflictError(
      "Le budget d’inférence de cette installation est atteint.",
    );
  }

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(workRuns)
      .where(
        and(
          eq(workRuns.workspaceId, input.context.workspaceId),
          eq(workRuns.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) return { run: existing[0], created: false };

    const [{ value: highestAttempt }] = await tx
      .select({ value: max(workRuns.attempt) })
      .from(workRuns)
      .where(eq(workRuns.workItemId, item.id));
    const [run] = await tx
      .insert(workRuns)
      .values({
        workItemId: item.id,
        workspaceId: input.context.workspaceId,
        agentId: agent.id,
        runtimeInstallationId,
        hermesProfileName: agent.hermesProfileName,
        triggerType: input.triggerType,
        triggerCommentId: input.triggerCommentId ?? null,
        automationId: input.automationId ?? null,
        originatorUserId: input.context.userId,
        parentRunId: input.parentRunId ?? null,
        attempt: Number(highestAttempt ?? 0) + 1,
        maxAttempts: Number(highestAttempt ?? 0) + 2,
        prompt: input.promptOverride
          ? cleanText(input.promptOverride, 20_000, "Le prompt délégué")
          : buildRunPrompt(item, teamContext, resources),
        contextSnapshot: {
          workItemKey: item.key,
          projectId: item.projectId,
          reviewPolicy: item.reviewPolicy,
          originatorRole: input.context.role,
          budgetWarning: budgetDecision.warning ? budgetDecision : null,
          team: teamContext,
          resources,
          ...(input.contextPatch ?? {}),
        },
        idempotencyKey,
      })
      .returning();
    await tx.insert(workRunEvents).values({
      runId: run.id,
      sequence: 1,
      type: "run.queued",
      payload: { triggerType: input.triggerType, agentId: agent.id },
      occurredAt: now,
    });
    await tx
      .update(workItems)
      .set({
        status: item.status === "backlog" ? "todo" : item.status,
        firstRunAt: item.firstRunAt ?? now,
        updatedAt: now,
      })
      .where(eq(workItems.id, item.id));
    await tx.insert(auditEvents).values({
      tenantId: input.context.tenantId,
      workspaceId: input.context.workspaceId,
      actorUserId: input.context.userId,
      action: "work_run.queued",
      targetType: "work_run",
      targetId: run.id,
      metadata: {
        workItemId: item.id,
        agentId: agent.id,
        triggerType: input.triggerType,
      },
    });
    return { run, created: true };
  });
  return result;
}

export async function createWorkspaceWorkItem(input: {
  context: WorkContext;
  title: string;
  description: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  projectId?: string | null;
  parentWorkItemId?: string | null;
  reviewPolicy?: WorkReviewPolicy;
  dueAt?: Date | null;
  assignee?: AssigneeInput;
  enqueue?: boolean;
}) {
  const title = cleanText(input.title, 240, "Le titre");
  const description = input.description.trim().slice(0, 40_000);
  const assignee = input.assignee ?? {};
  await validateWorkspaceReferences(input.context.workspaceId, {
    ...assignee,
    projectId: input.projectId,
    parentWorkItemId: input.parentWorkItemId,
  });
  const item = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${input.context.workspaceId}))`,
    );
    const [{ value }] = await tx
      .select({ value: max(workItems.number) })
      .from(workItems)
      .where(eq(workItems.workspaceId, input.context.workspaceId));
    const number = Number(value ?? 0) + 1;
    const [created] = await tx
      .insert(workItems)
      .values({
        workspaceId: input.context.workspaceId,
        projectId: input.projectId ?? null,
        number,
        key: workItemKey(input.context.workspaceSlug, number),
        title,
        description,
        status: input.status ?? (assignee.type ? "todo" : "backlog"),
        priority: input.priority ?? "none",
        creatorUserId: input.context.userId,
        ...assigneeColumns(assignee),
        parentWorkItemId: input.parentWorkItemId ?? null,
        dueAt: input.dueAt ?? null,
        reviewPolicy: input.reviewPolicy ?? "optional",
      })
      .returning();
    await tx.insert(auditEvents).values({
      tenantId: input.context.tenantId,
      workspaceId: input.context.workspaceId,
      actorUserId: input.context.userId,
      action: "work_item.created",
      targetType: "work_item",
      targetId: created.id,
      metadata: { key: created.key, assigneeType: created.assigneeType },
    });
    if (created.assigneeType === "user" && created.assigneeUserId) {
      await tx
        .insert(inboxItems)
        .values({
          workspaceId: input.context.workspaceId,
          userId: created.assigneeUserId,
          type: "work_item_assigned",
          sourceType: "work_item",
          sourceId: created.id,
          reason: `${created.key} vous a été assignée.`,
        })
        .onConflictDoNothing();
    }
    return created;
  });
  const run =
    input.enqueue !== false &&
    (item.assigneeType === "agent" || item.assigneeType === "team")
      ? await enqueueWorkRun({
          context: input.context,
          workItemId: item.id,
          triggerType: "assignment",
          idempotencyKey: `assignment:${item.id}:${item.assigneeAgentId ?? item.assigneeTeamId}`,
        })
      : null;
  return { item, run: run?.run ?? null };
}

export async function listWorkspaceWorkItems(input: {
  workspaceId: string;
  status?: WorkItemStatus | null;
  priority?: WorkItemPriority | null;
  query?: string | null;
  assigneeAgentId?: string | null;
  projectId?: string | null;
  labelId?: string | null;
  creatorUserId?: string | null;
  due?: "overdue" | "today" | "week" | "none" | null;
  limit?: number;
  offset?: number;
}) {
  const predicates = [eq(workItems.workspaceId, input.workspaceId)];
  if (input.status) predicates.push(eq(workItems.status, input.status));
  if (input.priority) predicates.push(eq(workItems.priority, input.priority));
  if (input.query?.trim()) {
    const query = `%${input.query.trim().slice(0, 200)}%`;
    predicates.push(
      or(
        ilike(workItems.title, query),
        ilike(workItems.key, query),
        ilike(workItems.description, query),
      )!,
    );
  }
  if (input.assigneeAgentId)
    predicates.push(eq(workItems.assigneeAgentId, input.assigneeAgentId));
  if (input.projectId)
    predicates.push(eq(workItems.projectId, input.projectId));
  if (input.creatorUserId)
    predicates.push(eq(workItems.creatorUserId, input.creatorUserId));
  if (input.labelId)
    predicates.push(sql`EXISTS (
    SELECT 1 FROM work_item_label_links link
    INNER JOIN work_item_labels label ON label.id = link.label_id
    WHERE link.work_item_id = ${workItems.id}
      AND label.id = ${input.labelId}
      AND label.workspace_id = ${input.workspaceId}
  )`);
  if (input.due === "none") predicates.push(isNull(workItems.dueAt));
  if (input.due === "overdue")
    predicates.push(
      and(
        lt(workItems.dueAt, new Date()),
        sql`${workItems.status} NOT IN ('done','cancelled')`,
      )!,
    );
  if (input.due === "today" || input.due === "week") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + (input.due === "today" ? 1 : 7));
    predicates.push(
      and(gte(workItems.dueAt, start), lt(workItems.dueAt, end))!,
    );
  }
  return (
    db
      .select({
        item: workItems,
        projectName: projects.name,
        assigneeAgentName: sql<
          string | null
        >`coalesce(${agents.name}, ${agentTeams.name})`,
        activeRunCount: sql<number>`count(${workRuns.id}) filter (where ${workRuns.status} in ('queued','preparing','running','waiting_input','cancelling'))::int`,
      })
      .from(workItems)
      .leftJoin(projects, eq(projects.id, workItems.projectId))
      .leftJoin(agents, eq(agents.id, workItems.assigneeAgentId))
      .leftJoin(agentTeams, eq(agentTeams.id, workItems.assigneeTeamId))
      .leftJoin(workRuns, eq(workRuns.workItemId, workItems.id))
      .where(and(...predicates))
      .groupBy(workItems.id, projects.name, agents.name, agentTeams.name)
      .orderBy(desc(workItems.updatedAt))
      // Product endpoints request one sentinel row to compute `hasMore` while
      // still exposing a maximum public page size of 200.
      .limit(Math.min(Math.max(input.limit ?? 100, 1), 201))
      .offset(Math.min(Math.max(input.offset ?? 0, 0), 100_000))
  );
}

export async function getWorkspaceWorkItem(
  workspaceId: string,
  workItemId: string,
  pagination?: { runLimit?: number; runOffset?: number },
) {
  const [item] = await db
    .select()
    .from(workItems)
    .where(
      and(eq(workItems.workspaceId, workspaceId), eq(workItems.id, workItemId)),
    )
    .limit(1);
  if (!item) throw new WorkNotFoundError("Tâche introuvable.");
  const runLimit = Math.min(Math.max(pagination?.runLimit ?? 200, 1), 200);
  const runOffset = Math.min(Math.max(pagination?.runOffset ?? 0, 0), 100_000);
  const runRows = await db
    .select({
      run: workRuns,
      agentName: agents.name,
      agentSlug: agents.slug,
    })
    .from(workRuns)
    .innerJoin(agents, eq(agents.id, workRuns.agentId))
    .where(eq(workRuns.workItemId, item.id))
    .orderBy(desc(workRuns.createdAt))
    .limit(runLimit + 1)
    .offset(runOffset);
  const runHasMore = runRows.length > runLimit;
  const runs = runRows
    .slice(0, runLimit)
    .map(({ run, agentName, agentSlug }) => ({
      ...run,
      agentName,
      agentSlug,
    }));
  const primaryRuns = runs.filter((run) => !run.parentRunId);
  const activeRun =
    primaryRuns.find((run) => !workRunTerminal(run.status)) ??
    primaryRuns[0] ??
    null;
  const [
    steps,
    comments,
    interventions,
    revisions,
    project,
    assigneeAgent,
    assigneeTeam,
    dependencies,
    resources,
    labels,
  ] = await Promise.all([
    activeRun
      ? db
          .select()
          .from(workRunPlanSteps)
          .where(eq(workRunPlanSteps.runId, activeRun.id))
          .orderBy(asc(workRunPlanSteps.position))
      : [],
    db
      .select()
      .from(workItemComments)
      .where(eq(workItemComments.workItemId, item.id))
      .orderBy(asc(workItemComments.createdAt)),
    db
      .select()
      .from(workInterventions)
      .where(eq(workInterventions.workItemId, item.id))
      .orderBy(desc(workInterventions.createdAt)),
    activeRun
      ? db
          .select()
          .from(workRunPlanRevisions)
          .where(eq(workRunPlanRevisions.runId, activeRun.id))
          .orderBy(desc(workRunPlanRevisions.sequence))
          .limit(1)
      : [],
    item.projectId
      ? db
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(
            and(
              eq(projects.id, item.projectId),
              eq(projects.workspaceId, workspaceId),
            ),
          )
          .limit(1)
      : [],
    item.assigneeAgentId
      ? db
          .select({ id: agents.id, name: agents.name })
          .from(agents)
          .where(
            and(
              eq(agents.id, item.assigneeAgentId),
              eq(agents.workspaceId, workspaceId),
            ),
          )
          .limit(1)
      : [],
    item.assigneeTeamId
      ? db
          .select({ id: agentTeams.id, name: agentTeams.name })
          .from(agentTeams)
          .where(
            and(
              eq(agentTeams.id, item.assigneeTeamId),
              eq(agentTeams.workspaceId, workspaceId),
            ),
          )
          .limit(1)
      : [],
    db.execute<{
      id: string;
      key: string;
      title: string;
      direction: "depends_on" | "blocks";
    }>(sql`
      SELECT dependency.id, dependency.key, dependency.title, 'depends_on'::text AS direction
      FROM work_item_dependencies relation
      INNER JOIN work_items dependency ON dependency.id = relation.depends_on_work_item_id
      WHERE relation.work_item_id = ${item.id} AND dependency.workspace_id = ${workspaceId}
      UNION ALL
      SELECT dependent.id, dependent.key, dependent.title, 'blocks'::text AS direction
      FROM work_item_dependencies relation
      INNER JOIN work_items dependent ON dependent.id = relation.work_item_id
      WHERE relation.depends_on_work_item_id = ${item.id} AND dependent.workspace_id = ${workspaceId}
      ORDER BY key
    `),
    db
      .select()
      .from(workResources)
      .where(
        and(
          eq(workResources.workspaceId, workspaceId),
          eq(workResources.workItemId, item.id),
        ),
      )
      .orderBy(asc(workResources.createdAt)),
    db
      .select({
        id: workItemLabels.id,
        name: workItemLabels.name,
        color: workItemLabels.color,
      })
      .from(workItemLabelLinks)
      .innerJoin(
        workItemLabels,
        eq(workItemLabels.id, workItemLabelLinks.labelId),
      )
      .where(
        and(
          eq(workItemLabelLinks.workItemId, item.id),
          eq(workItemLabels.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(workItemLabels.name)),
  ]);
  return {
    item,
    runs,
    runPagination: { limit: runLimit, offset: runOffset, hasMore: runHasMore },
    activeRun,
    steps,
    comments,
    interventions,
    planRevision: revisions[0] ?? null,
    project: project[0] ?? null,
    assignee: assigneeAgent[0] ?? assigneeTeam[0] ?? null,
    dependencies,
    resources,
    labels,
  };
}

export async function listWorkspaceWorkLabels(workspaceId: string) {
  return db
    .select()
    .from(workItemLabels)
    .where(eq(workItemLabels.workspaceId, workspaceId))
    .orderBy(asc(workItemLabels.name));
}

export async function createWorkspaceWorkLabel(input: {
  context: WorkContext;
  name: string;
  color: string;
}) {
  const color = input.color.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color))
    throw new WorkDomainError(
      "invalid_label_color",
      "La couleur doit être au format #RRGGBB.",
    );
  const [label] = await db
    .insert(workItemLabels)
    .values({
      workspaceId: input.context.workspaceId,
      name: cleanText(input.name, 80, "Le nom"),
      color,
    })
    .returning();
  return label;
}

export async function setWorkspaceWorkItemLabel(input: {
  context: WorkContext;
  workItemId: string;
  labelId: string;
  attached: boolean;
}) {
  const [scoped] = await db
    .select({ itemId: workItems.id, labelId: workItemLabels.id })
    .from(workItems)
    .innerJoin(workItemLabels, eq(workItemLabels.id, input.labelId))
    .where(
      and(
        eq(workItems.id, input.workItemId),
        eq(workItems.workspaceId, input.context.workspaceId),
        eq(workItemLabels.workspaceId, input.context.workspaceId),
      ),
    )
    .limit(1);
  if (!scoped) throw new WorkNotFoundError("Tâche ou label introuvable.");
  if (input.attached) {
    await db
      .insert(workItemLabelLinks)
      .values({ workItemId: input.workItemId, labelId: input.labelId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(workItemLabelLinks)
      .where(
        and(
          eq(workItemLabelLinks.workItemId, input.workItemId),
          eq(workItemLabelLinks.labelId, input.labelId),
        ),
      );
  }
}

const SAVED_VIEW_KEYS = new Set([
  "q",
  "status",
  "priority",
  "project",
  "agent",
  "label",
  "creator",
  "due",
  "view",
]);

export async function listWorkspaceSavedViews(
  workspaceId: string,
  userId: string,
) {
  return db
    .select()
    .from(workSavedViews)
    .where(
      and(
        eq(workSavedViews.workspaceId, workspaceId),
        eq(workSavedViews.userId, userId),
      ),
    )
    .orderBy(asc(workSavedViews.name));
}

export async function createWorkspaceSavedView(input: {
  context: WorkContext;
  name: string;
  filters: Record<string, string>;
}) {
  const filters = Object.fromEntries(
    Object.entries(input.filters).filter(
      ([key, value]) =>
        SAVED_VIEW_KEYS.has(key) &&
        typeof value === "string" &&
        value.length <= 240 &&
        value.length > 0,
    ),
  );
  const [view] = await db
    .insert(workSavedViews)
    .values({
      workspaceId: input.context.workspaceId,
      userId: input.context.userId,
      name: cleanText(input.name, 80, "Le nom"),
      filters,
    })
    .onConflictDoUpdate({
      target: [
        workSavedViews.workspaceId,
        workSavedViews.userId,
        workSavedViews.name,
      ],
      set: { filters, updatedAt: new Date() },
    })
    .returning();
  return view;
}

export async function deleteWorkspaceSavedView(input: {
  context: WorkContext;
  viewId: string;
}) {
  const [view] = await db
    .delete(workSavedViews)
    .where(
      and(
        eq(workSavedViews.id, input.viewId),
        eq(workSavedViews.workspaceId, input.context.workspaceId),
        eq(workSavedViews.userId, input.context.userId),
      ),
    )
    .returning();
  if (!view) throw new WorkNotFoundError("Vue enregistrée introuvable.");
  return view;
}

export async function updateWorkspaceWorkItem(input: {
  context: WorkContext;
  workItemId: string;
  title?: string;
  description?: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  projectId?: string | null;
  dueAt?: Date | null;
  reviewPolicy?: WorkReviewPolicy;
}) {
  const [current] = await db
    .select()
    .from(workItems)
    .where(
      and(
        eq(workItems.id, input.workItemId),
        eq(workItems.workspaceId, input.context.workspaceId),
      ),
    )
    .limit(1);
  if (!current) throw new WorkNotFoundError("Tâche introuvable.");
  if (input.status) assertWorkItemTransition(current.status, input.status);
  if (input.projectId)
    await validateWorkspaceReferences(input.context.workspaceId, {
      projectId: input.projectId,
    });
  const now = new Date();
  const [updated] = await db
    .update(workItems)
    .set({
      ...(input.title !== undefined
        ? { title: cleanText(input.title, 240, "Le titre") }
        : {}),
      ...(input.description !== undefined
        ? { description: input.description.trim().slice(0, 40_000) }
        : {}),
      ...(input.status !== undefined
        ? {
            status: input.status,
            completedAt: input.status === "done" ? now : null,
            cancelledAt: input.status === "cancelled" ? now : null,
          }
        : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
      ...(input.reviewPolicy !== undefined
        ? { reviewPolicy: input.reviewPolicy }
        : {}),
      updatedAt: now,
    })
    .where(eq(workItems.id, current.id))
    .returning();
  await db.insert(auditEvents).values({
    tenantId: input.context.tenantId,
    workspaceId: input.context.workspaceId,
    actorUserId: input.context.userId,
    action: "work_item.updated",
    targetType: "work_item",
    targetId: current.id,
    metadata: { status: updated.status },
  });
  if (
    input.status &&
    input.status !== current.status &&
    workFeatureEnabled("WORK_AUTOMATIONS_ENABLED")
  ) {
    const eventName = `work_item.${input.status}`;
    const automations = await db
      .select({ id: workAutomations.id, config: workAutomations.triggerConfig })
      .from(workAutomations)
      .where(
        and(
          eq(workAutomations.workspaceId, input.context.workspaceId),
          eq(workAutomations.status, "active"),
          eq(workAutomations.triggerType, "event"),
        ),
      );
    await Promise.allSettled(
      automations
        .filter(
          (automation) => String(automation.config.event ?? "") === eventName,
        )
        .map((automation) =>
          triggerWorkspaceAutomation({
            context: input.context,
            automationId: automation.id,
            idempotencyKey: `event:${automation.id}:${updated.id}:${eventName}:${now.toISOString()}`,
            safePayload: { event: eventName, workItemId: updated.id },
          }),
        ),
    );
  }
  return updated;
}

export async function assignWorkspaceWorkItem(input: {
  context: WorkContext;
  workItemId: string;
  assignee: AssigneeInput;
}) {
  await validateWorkspaceReferences(input.context.workspaceId, input.assignee);
  const [current] = await db
    .select()
    .from(workItems)
    .where(
      and(
        eq(workItems.id, input.workItemId),
        eq(workItems.workspaceId, input.context.workspaceId),
      ),
    )
    .limit(1);
  if (!current) throw new WorkNotFoundError("Tâche introuvable.");
  const [updated] = await db
    .update(workItems)
    .set({
      ...assigneeColumns(input.assignee),
      status:
        current.status === "backlog" && input.assignee.type
          ? "todo"
          : current.status,
      updatedAt: new Date(),
    })
    .where(eq(workItems.id, current.id))
    .returning();
  await db
    .update(workRuns)
    .set({
      status: "cancelled",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workRuns.workItemId, current.id),
        eq(workRuns.status, "queued"),
        ne(
          workRuns.agentId,
          input.assignee.agentId ?? "00000000-0000-0000-0000-000000000000",
        ),
      ),
    );
  const run =
    updated.assigneeType === "agent" || updated.assigneeType === "team"
      ? await enqueueWorkRun({
          context: input.context,
          workItemId: updated.id,
          triggerType: "assignment",
          idempotencyKey: `assignment:${updated.id}:${updated.assigneeAgentId ?? updated.assigneeTeamId}:${updated.updatedAt.getTime()}`,
        })
      : null;
  return { item: updated, run: run?.run ?? null };
}

export async function addWorkspaceWorkComment(input: {
  context: WorkContext;
  workItemId: string;
  content: string;
}) {
  const content = cleanText(input.content, 20_000, "Le commentaire");
  const [item] = await db
    .select()
    .from(workItems)
    .where(
      and(
        eq(workItems.id, input.workItemId),
        eq(workItems.workspaceId, input.context.workspaceId),
      ),
    )
    .limit(1);
  if (!item) throw new WorkNotFoundError("Tâche introuvable.");
  const [comment] = await db
    .insert(workItemComments)
    .values({
      workItemId: item.id,
      authorType: "user",
      authorUserId: input.context.userId,
      content,
    })
    .returning();

  const mentions = [
    ...content.matchAll(/@([a-zA-Z0-9][a-zA-Z0-9._-]{0,127})/g),
  ].map((match) => match[1].toLowerCase());
  const mentionedAgents = mentions.length
    ? await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.workspaceId, input.context.workspaceId),
            inArray(sql`lower(${agents.slug})`, [...new Set(mentions)]),
          ),
        )
    : [];
  const mentionedTeams = mentions.length
    ? await db
        .select()
        .from(agentTeams)
        .where(
          and(
            eq(agentTeams.workspaceId, input.context.workspaceId),
            inArray(sql`lower(${agentTeams.slug})`, [...new Set(mentions)]),
            isNull(agentTeams.archivedAt),
          ),
        )
    : [];
  const runs = [];
  for (const agent of mentionedAgents) {
    runs.push(
      (
        await enqueueWorkRun({
          context: input.context,
          workItemId: item.id,
          triggerType: "mention",
          forceAgentId: agent.id,
          triggerCommentId: comment.id,
          idempotencyKey: `mention:${comment.id}:${agent.id}`,
        })
      ).run,
    );
  }
  for (const team of mentionedTeams) {
    runs.push(
      (
        await enqueueWorkRun({
          context: input.context,
          workItemId: item.id,
          triggerType: "mention",
          forceAgentId: team.leadAgentId,
          triggerCommentId: comment.id,
          idempotencyKey: `mention-team:${comment.id}:${team.id}`,
        })
      ).run,
    );
  }
  return { comment, runs };
}

export async function cancelWorkspaceWorkRun(input: {
  context: WorkContext;
  runId: string;
}) {
  const [run] = await db
    .select()
    .from(workRuns)
    .where(
      and(
        eq(workRuns.id, input.runId),
        eq(workRuns.workspaceId, input.context.workspaceId),
      ),
    )
    .limit(1);
  if (!run) throw new WorkNotFoundError("Run introuvable.");
  if (workRunTerminal(run.status)) return run;
  const status = run.status === "queued" ? "cancelled" : "cancelling";
  const [updated] = await db
    .update(workRuns)
    .set({
      status,
      completedAt: status === "cancelled" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(workRuns.id, run.id))
    .returning();
  await db.insert(auditEvents).values({
    tenantId: input.context.tenantId,
    workspaceId: input.context.workspaceId,
    actorUserId: input.context.userId,
    action: "work_run.cancel_requested",
    targetType: "work_run",
    targetId: run.id,
    metadata: { previousStatus: run.status, status },
  });
  return updated;
}

export async function cancelWorkspaceWorkItem(input: {
  context: WorkContext;
  workItemId: string;
}) {
  const [item] = await db
    .select()
    .from(workItems)
    .where(
      and(
        eq(workItems.id, input.workItemId),
        eq(workItems.workspaceId, input.context.workspaceId),
      ),
    )
    .limit(1);
  if (!item) throw new WorkNotFoundError("Tâche introuvable.");
  if (item.status === "cancelled") return { item, runs: [] };
  assertWorkItemTransition(item.status, "cancelled");
  const now = new Date();
  return db.transaction(async (tx) => {
    const activeRuns = await tx
      .select()
      .from(workRuns)
      .where(
        and(
          eq(workRuns.workItemId, item.id),
          inArray(workRuns.status, [
            "queued",
            "preparing",
            "running",
            "waiting_input",
            "cancelling",
          ]),
        ),
      );
    const updatedRuns = [];
    for (const run of activeRuns) {
      const status = run.status === "queued" ? "cancelled" : "cancelling";
      const [updatedRun] = await tx
        .update(workRuns)
        .set({
          status,
          completedAt: status === "cancelled" ? now : null,
          updatedAt: now,
        })
        .where(eq(workRuns.id, run.id))
        .returning();
      updatedRuns.push(updatedRun);
    }
    const [updatedItem] = await tx
      .update(workItems)
      .set({
        status: "cancelled",
        cancelledAt: now,
        updatedAt: now,
      })
      .where(eq(workItems.id, item.id))
      .returning();
    await tx.insert(auditEvents).values({
      tenantId: input.context.tenantId,
      workspaceId: input.context.workspaceId,
      actorUserId: input.context.userId,
      action: "work_item.cancelled",
      targetType: "work_item",
      targetId: item.id,
      metadata: {
        previousStatus: item.status,
        activeRunCount: activeRuns.length,
      },
    });
    return { item: updatedItem, runs: updatedRuns };
  });
}

export async function promoteWorkspacePlanStep(input: {
  context: WorkContext;
  runId: string;
  stepId: string;
}) {
  const [step] = await db
    .select({ step: workRunPlanSteps, run: workRuns, item: workItems })
    .from(workRunPlanSteps)
    .innerJoin(workRuns, eq(workRuns.id, workRunPlanSteps.runId))
    .innerJoin(workItems, eq(workItems.id, workRuns.workItemId))
    .where(
      and(
        eq(workRunPlanSteps.id, input.stepId),
        eq(workRunPlanSteps.runId, input.runId),
        eq(workRuns.workspaceId, input.context.workspaceId),
      ),
    )
    .limit(1);
  if (!step) throw new WorkNotFoundError("Étape introuvable.");
  if (step.step.promotedWorkItemId) {
    const [existing] = await db
      .select()
      .from(workItems)
      .where(eq(workItems.id, step.step.promotedWorkItemId))
      .limit(1);
    return existing;
  }
  const { item } = await createWorkspaceWorkItem({
    context: input.context,
    title: step.step.content,
    description: `Sous-tâche promue depuis le plan du run ${step.run.id}.`,
    status: "backlog",
    priority: step.item.priority,
    projectId: step.item.projectId,
    parentWorkItemId: step.item.id,
    reviewPolicy: step.item.reviewPolicy,
    enqueue: false,
  });
  await db
    .update(workRunPlanSteps)
    .set({ promotedWorkItemId: item.id, updatedAt: new Date() })
    .where(eq(workRunPlanSteps.id, step.step.id));
  return item;
}

export async function addWorkspaceWorkDependency(input: {
  context: WorkContext;
  workItemId: string;
  dependsOnWorkItemId: string;
}) {
  if (input.workItemId === input.dependsOnWorkItemId) {
    throw new WorkConflictError("Une tâche ne peut pas dépendre d’elle-même.");
  }
  const scoped = await db
    .select({ id: workItems.id })
    .from(workItems)
    .where(
      and(
        eq(workItems.workspaceId, input.context.workspaceId),
        inArray(workItems.id, [input.workItemId, input.dependsOnWorkItemId]),
      ),
    );
  if (scoped.length !== 2)
    throw new WorkNotFoundError("Tâche ou dépendance introuvable.");
  const cycle = await db.execute<{ cycle: boolean }>(sql`
    WITH RECURSIVE dependency_path(id) AS (
      SELECT ${input.dependsOnWorkItemId}::uuid
      UNION
      SELECT dependency.depends_on_work_item_id
      FROM work_item_dependencies dependency
      INNER JOIN dependency_path path ON dependency.work_item_id = path.id
    )
    SELECT EXISTS(SELECT 1 FROM dependency_path WHERE id = ${input.workItemId}::uuid) AS cycle
  `);
  if (cycle[0]?.cycle)
    throw new WorkConflictError("Cette dépendance créerait un cycle.");
  try {
    const [dependency] = await db
      .insert(workItemDependencies)
      .values({
        workItemId: input.workItemId,
        dependsOnWorkItemId: input.dependsOnWorkItemId,
        createdByUserId: input.context.userId,
      })
      .onConflictDoNothing()
      .returning();
    await db.insert(auditEvents).values({
      tenantId: input.context.tenantId,
      workspaceId: input.context.workspaceId,
      actorUserId: input.context.userId,
      action: "work_item.dependency_added",
      targetType: "work_item",
      targetId: input.workItemId,
      metadata: { dependsOnWorkItemId: input.dependsOnWorkItemId },
    });
    return (
      dependency ?? {
        workItemId: input.workItemId,
        dependsOnWorkItemId: input.dependsOnWorkItemId,
      }
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23514") {
      throw new WorkConflictError(
        "Cette dépendance est invalide ou créerait un cycle.",
      );
    }
    throw error;
  }
}

export async function removeWorkspaceWorkDependency(input: {
  context: WorkContext;
  workItemId: string;
  dependsOnWorkItemId: string;
}) {
  const [item] = await db
    .select({ id: workItems.id })
    .from(workItems)
    .where(
      and(
        eq(workItems.id, input.workItemId),
        eq(workItems.workspaceId, input.context.workspaceId),
      ),
    )
    .limit(1);
  if (!item) throw new WorkNotFoundError("Tâche introuvable.");
  await db
    .delete(workItemDependencies)
    .where(
      and(
        eq(workItemDependencies.workItemId, input.workItemId),
        eq(workItemDependencies.dependsOnWorkItemId, input.dependsOnWorkItemId),
      ),
    );
  await db.insert(auditEvents).values({
    tenantId: input.context.tenantId,
    workspaceId: input.context.workspaceId,
    actorUserId: input.context.userId,
    action: "work_item.dependency_removed",
    targetType: "work_item",
    targetId: input.workItemId,
    metadata: { dependsOnWorkItemId: input.dependsOnWorkItemId },
  });
}

function validateWorkResourceUri(kind: WorkResourceKind, value: string) {
  const uri = cleanText(value, 2_000, "L’URI");
  if (kind === "link" || kind === "knowledge") {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new WorkDomainError(
        "invalid_resource_uri",
        "La ressource doit utiliser une URL HTTPS.",
      );
    }
    if (parsed.protocol !== "https:")
      throw new WorkDomainError(
        "invalid_resource_uri",
        "La ressource doit utiliser une URL HTTPS.",
      );
    return parsed.toString();
  }
  if (
    !/^work:\/\/(resources|output)\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(uri) ||
    uri.includes("..") ||
    uri.includes("\\")
  ) {
    throw new WorkDomainError(
      "invalid_resource_uri",
      "Les fichiers doivent utiliser une URI work://resources/… ou work://output/… sûre.",
    );
  }
  return uri;
}

function sanitizeResourceMetadata(
  metadata: Record<string, unknown> | undefined,
) {
  if (!metadata) return {};
  const sanitize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sanitize);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, nested]) =>
        /(secret|token|password|credential|authorization)/i.test(key)
          ? []
          : [[key, sanitize(nested)]],
      ),
    );
  };
  const safe = sanitize(metadata) as Record<string, unknown>;
  if (JSON.stringify(safe).length > 10_000)
    throw new WorkDomainError(
      "invalid_resource_metadata",
      "Les métadonnées de ressource sont trop volumineuses.",
    );
  return safe;
}

export async function createWorkspaceWorkResource(input: {
  context: WorkContext;
  workItemId?: string;
  projectId?: string;
  kind: WorkResourceKind;
  name: string;
  uri: string;
  metadata?: Record<string, unknown>;
}) {
  if (Boolean(input.workItemId) === Boolean(input.projectId)) {
    throw new WorkDomainError(
      "invalid_resource_scope",
      "Une ressource cible exactement une tâche ou un projet.",
    );
  }
  if (input.workItemId) {
    const [item] = await db
      .select({ id: workItems.id })
      .from(workItems)
      .where(
        and(
          eq(workItems.id, input.workItemId),
          eq(workItems.workspaceId, input.context.workspaceId),
        ),
      )
      .limit(1);
    if (!item) throw new WorkNotFoundError("Tâche introuvable.");
  }
  if (input.projectId)
    await validateWorkspaceReferences(input.context.workspaceId, {
      projectId: input.projectId,
    });
  const [resource] = await db
    .insert(workResources)
    .values({
      workspaceId: input.context.workspaceId,
      workItemId: input.workItemId ?? null,
      projectId: input.projectId ?? null,
      kind: input.kind,
      name: cleanText(input.name, 240, "Le nom"),
      uri: validateWorkResourceUri(input.kind, input.uri),
      metadata: sanitizeResourceMetadata(input.metadata),
      createdByUserId: input.context.userId,
    })
    .returning();
  await db.insert(auditEvents).values({
    tenantId: input.context.tenantId,
    workspaceId: input.context.workspaceId,
    actorUserId: input.context.userId,
    action: "work_resource.created",
    targetType: input.workItemId ? "work_item" : "project",
    targetId: input.workItemId ?? input.projectId!,
    metadata: { resourceId: resource.id, kind: resource.kind },
  });
  return resource;
}

export async function deleteWorkspaceWorkResource(input: {
  context: WorkContext;
  resourceId: string;
}) {
  const [resource] = await db
    .delete(workResources)
    .where(
      and(
        eq(workResources.id, input.resourceId),
        eq(workResources.workspaceId, input.context.workspaceId),
      ),
    )
    .returning();
  if (!resource) throw new WorkNotFoundError("Ressource introuvable.");
  return resource;
}

export async function listWorkspaceProjects(workspaceId: string) {
  return db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(asc(projects.name));
}

export async function getWorkspaceProject(
  workspaceId: string,
  projectId: string,
) {
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!project) throw new WorkNotFoundError("Projet introuvable.");
  const [tasks, automations, resources] = await Promise.all([
    listWorkspaceWorkItems({ workspaceId, projectId, limit: 200 }),
    db
      .select()
      .from(workAutomations)
      .where(
        and(
          eq(workAutomations.workspaceId, workspaceId),
          eq(workAutomations.projectId, projectId),
        ),
      )
      .orderBy(asc(workAutomations.name)),
    db
      .select()
      .from(workResources)
      .where(
        and(
          eq(workResources.workspaceId, workspaceId),
          eq(workResources.projectId, projectId),
        ),
      )
      .orderBy(asc(workResources.createdAt)),
  ]);
  const completed = tasks.filter(({ item }) => item.status === "done").length;
  return {
    project,
    tasks,
    automations,
    resources,
    progress: { completed, total: tasks.length },
  };
}

export async function createWorkspaceProject(input: {
  context: WorkContext;
  key: string;
  name: string;
  description?: string;
}) {
  const key = cleanText(input.key.toUpperCase(), 24, "La clé projet");
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(key))
    throw new WorkDomainError("invalid_project_key", "Clé projet invalide.");
  const [project] = await db
    .insert(projects)
    .values({
      workspaceId: input.context.workspaceId,
      key,
      name: cleanText(input.name, 160, "Le nom"),
      description: input.description?.trim().slice(0, 10_000),
      status: "active",
      leadUserId: input.context.userId,
    })
    .returning();
  return project;
}

export async function listWorkspaceInbox(input: {
  workspaceId: string;
  userId: string;
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}) {
  return db
    .select()
    .from(inboxItems)
    .where(
      and(
        eq(inboxItems.workspaceId, input.workspaceId),
        eq(inboxItems.userId, input.userId),
        ...(input.unreadOnly ? [isNull(inboxItems.readAt)] : []),
      ),
    )
    .orderBy(desc(inboxItems.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 201))
    .offset(Math.min(Math.max(input.offset ?? 0, 0), 100_000));
}

export async function markWorkspaceInbox(input: {
  workspaceId: string;
  userId: string;
  ids?: string[];
  all?: boolean;
}) {
  const predicate = input.all
    ? and(
        eq(inboxItems.workspaceId, input.workspaceId),
        eq(inboxItems.userId, input.userId),
        isNull(inboxItems.readAt),
      )
    : and(
        eq(inboxItems.workspaceId, input.workspaceId),
        eq(inboxItems.userId, input.userId),
        inArray(inboxItems.id, input.ids ?? []),
      );
  if (!input.all && !input.ids?.length) return [];
  return db
    .update(inboxItems)
    .set({ readAt: new Date() })
    .where(predicate)
    .returning();
}

export async function listWorkspaceAutomations(workspaceId: string) {
  return db
    .select()
    .from(workAutomations)
    .where(eq(workAutomations.workspaceId, workspaceId))
    .orderBy(asc(workAutomations.name));
}

export async function listWorkspaceAutomationRuns(
  workspaceId: string,
  automationId?: string,
) {
  return db
    .select()
    .from(workAutomationRuns)
    .where(
      and(
        eq(workAutomationRuns.workspaceId, workspaceId),
        ...(automationId
          ? [eq(workAutomationRuns.automationId, automationId)]
          : []),
      ),
    )
    .orderBy(desc(workAutomationRuns.startedAt))
    .limit(200);
}

export async function listWorkspaceAgentTeams(workspaceId: string) {
  return db
    .select({
      id: agentTeams.id,
      workspaceId: agentTeams.workspaceId,
      name: agentTeams.name,
      slug: agentTeams.slug,
      description: agentTeams.description,
      leadAgentId: agentTeams.leadAgentId,
      delegationPolicy: agentTeams.delegationPolicy,
      concurrencyLimit: agentTeams.concurrencyLimit,
      visibility: agentTeams.visibility,
      archivedAt: agentTeams.archivedAt,
      createdAt: agentTeams.createdAt,
      updatedAt: agentTeams.updatedAt,
      leadAgentName: agents.name,
      memberCount: sql<number>`count(${agentTeamMembers.agentId})::int`,
    })
    .from(agentTeams)
    .leftJoin(agentTeamMembers, eq(agentTeamMembers.teamId, agentTeams.id))
    .leftJoin(agents, eq(agents.id, agentTeams.leadAgentId))
    .where(
      and(
        eq(agentTeams.workspaceId, workspaceId),
        isNull(agentTeams.archivedAt),
      ),
    )
    .groupBy(agentTeams.id, agents.name)
    .orderBy(asc(agentTeams.name));
}

export async function createWorkspaceAgentTeam(input: {
  context: WorkContext;
  name: string;
  description?: string;
  leadAgentId: string;
  memberAgentIds?: string[];
  concurrencyLimit?: number;
  delegationPolicy?: { autoDelegatePlanSteps?: boolean };
}) {
  if (!workFeatureEnabled("WORK_AGENT_TEAMS_ENABLED"))
    throw new WorkConflictError("Les équipes d’agents sont désactivées.");
  const memberIds = [
    ...new Set([input.leadAgentId, ...(input.memberAgentIds ?? [])]),
  ];
  const validAgents = await db
    .select({ id: agents.id })
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, input.context.workspaceId),
        inArray(agents.id, memberIds),
      ),
    );
  if (validAgents.length !== memberIds.length)
    throw new WorkDomainError(
      "invalid_team_members",
      "Un membre de l’équipe est hors workspace.",
    );
  return db.transaction(async (tx) => {
    const [team] = await tx
      .insert(agentTeams)
      .values({
        workspaceId: input.context.workspaceId,
        name: cleanText(input.name, 160, "Le nom"),
        slug: `${workSlug(input.name)}-${randomUUID().slice(0, 6)}`,
        description: input.description?.trim().slice(0, 10_000),
        leadAgentId: input.leadAgentId,
        delegationPolicy: {
          autoDelegatePlanSteps:
            input.delegationPolicy?.autoDelegatePlanSteps === true,
        },
        concurrencyLimit: Math.min(
          Math.max(input.concurrencyLimit ?? 1, 1),
          64,
        ),
      })
      .returning();
    await tx
      .insert(agentTeamMembers)
      .values(memberIds.map((agentId) => ({ teamId: team.id, agentId })))
      .onConflictDoNothing();
    await tx.insert(auditEvents).values({
      tenantId: input.context.tenantId,
      workspaceId: input.context.workspaceId,
      actorUserId: input.context.userId,
      action: "agent_team.created",
      targetType: "agent_team",
      targetId: team.id,
      metadata: {
        leadAgentId: input.leadAgentId,
        memberCount: memberIds.length,
      },
    });
    return team;
  });
}

export async function createWorkspaceAutomation(input: {
  context: WorkContext;
  name: string;
  triggerType: "cron" | "webhook" | "event" | "manual";
  triggerConfig?: Record<string, unknown>;
  timezone?: string;
  workItemTemplate: {
    title: string;
    description?: string;
    priority?: WorkItemPriority;
    reviewPolicy?: WorkReviewPolicy;
  };
  assignee: AssigneeInput;
  projectId?: string | null;
  active?: boolean;
  dedupePolicy?: Record<string, unknown>;
  concurrencyPolicy?: Record<string, unknown>;
}) {
  if (!workFeatureEnabled("WORK_AUTOMATIONS_ENABLED"))
    throw new WorkConflictError("Les automatisations sont désactivées.");
  await validateWorkspaceReferences(input.context.workspaceId, {
    ...input.assignee,
    projectId: input.projectId,
  });
  if (!input.assignee.type)
    throw new WorkDomainError(
      "invalid_assignee",
      "Une automatisation exige un assigné.",
    );
  let nextTriggerAt: Date | null = null;
  if (input.triggerType === "cron") {
    const everyMinutes = Number(input.triggerConfig?.everyMinutes);
    if (
      !Number.isInteger(everyMinutes) ||
      everyMinutes < 1 ||
      everyMinutes > 525_600
    ) {
      throw new WorkDomainError(
        "invalid_automation_cron",
        "Un déclencheur cron exige triggerConfig.everyMinutes entre 1 et 525600.",
      );
    }
    nextTriggerAt = new Date(Date.now() + everyMinutes * 60_000);
  }
  const [automation] = await db
    .insert(workAutomations)
    .values({
      workspaceId: input.context.workspaceId,
      projectId: input.projectId ?? null,
      name: cleanText(input.name, 160, "Le nom"),
      status: input.active ? "active" : "inactive",
      triggerType: input.triggerType,
      triggerConfig: input.triggerConfig ?? {},
      timezone: input.timezone?.trim().slice(0, 64) || "UTC",
      workItemTemplate: input.workItemTemplate,
      ...assigneeColumns(input.assignee),
      assigneeType: input.assignee.type,
      dedupePolicy: input.dedupePolicy ?? {},
      concurrencyPolicy: input.concurrencyPolicy ?? {},
      nextTriggerAt,
      createdByUserId: input.context.userId,
    })
    .returning();
  return automation;
}

export async function triggerWorkspaceAutomation(input: {
  context: WorkContext;
  automationId: string;
  idempotencyKey?: string;
  safePayload?: Record<string, unknown>;
}) {
  if (!workFeatureEnabled("WORK_AUTOMATIONS_ENABLED"))
    throw new WorkConflictError("Les automatisations sont désactivées.");
  const [automation] = await db
    .select()
    .from(workAutomations)
    .where(
      and(
        eq(workAutomations.id, input.automationId),
        eq(workAutomations.workspaceId, input.context.workspaceId),
      ),
    )
    .limit(1);
  if (!automation) throw new WorkNotFoundError("Automatisation introuvable.");
  if (automation.status === "error")
    throw new WorkConflictError(
      "L’automatisation doit être corrigée avant exécution.",
    );
  if (automation.triggerType !== "manual" && automation.status !== "active")
    throw new WorkConflictError("Cette automatisation n’est pas active.");
  const idempotencyKey = cleanText(
    input.idempotencyKey ?? randomUUID(),
    240,
    "La clé d’idempotence",
  );
  const [history] = await db
    .insert(workAutomationRuns)
    .values({
      automationId: automation.id,
      workspaceId: input.context.workspaceId,
      triggerType: automation.triggerType,
      idempotencyKey,
      safePayload: sanitizeResourceMetadata(input.safePayload),
    })
    .onConflictDoNothing()
    .returning();
  if (!history) {
    const [existing] = await db
      .select()
      .from(workAutomationRuns)
      .where(
        and(
          eq(workAutomationRuns.automationId, automation.id),
          eq(workAutomationRuns.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (!existing)
      throw new WorkConflictError("Déclenchement concurrent introuvable.");
    const [existingItem] = existing.workItemId
      ? await db
          .select()
          .from(workItems)
          .where(
            and(
              eq(workItems.id, existing.workItemId),
              eq(workItems.workspaceId, input.context.workspaceId),
            ),
          )
          .limit(1)
      : [];
    return {
      item: existingItem ?? null,
      run: null,
      automationRun: existing,
      created: false,
    };
  }
  const template = automation.workItemTemplate as {
    title?: unknown;
    description?: unknown;
    priority?: WorkItemPriority;
    reviewPolicy?: WorkReviewPolicy;
  };
  try {
    const result = await createWorkspaceWorkItem({
      context: input.context,
      title: String(template.title ?? automation.name),
      description: String(
        template.description ??
          `Créée par l’automatisation ${automation.name}.`,
      ),
      priority: template.priority,
      reviewPolicy: template.reviewPolicy,
      projectId: automation.projectId,
      assignee: {
        type: automation.assigneeType,
        userId: automation.assigneeUserId,
        agentId: automation.assigneeAgentId,
        teamId: automation.assigneeTeamId,
      },
      enqueue: false,
    });
    const run =
      automation.assigneeType === "agent" || automation.assigneeType === "team"
        ? (
            await enqueueWorkRun({
              context: input.context,
              workItemId: result.item.id,
              triggerType: "automation",
              automationId: automation.id,
              idempotencyKey: `automation:${automation.id}:${history.id}`,
            })
          ).run
        : null;
    const now = new Date();
    const [automationRun] = await db
      .update(workAutomationRuns)
      .set({
        status: "succeeded",
        workItemId: result.item.id,
        completedAt: now,
      })
      .where(eq(workAutomationRuns.id, history.id))
      .returning();
    await db
      .update(workAutomations)
      .set({ lastTriggeredAt: now, updatedAt: now })
      .where(eq(workAutomations.id, automation.id));
    await db.insert(auditEvents).values({
      tenantId: input.context.tenantId,
      workspaceId: input.context.workspaceId,
      actorUserId: input.context.userId,
      action: "work_automation.triggered",
      targetType: "work_automation",
      targetId: automation.id,
      metadata: { automationRunId: history.id, workItemId: result.item.id },
    });
    return { item: result.item, run, automationRun, created: true };
  } catch (error) {
    await db
      .update(workAutomationRuns)
      .set({
        status: "failed",
        errorCode:
          error instanceof WorkDomainError
            ? error.code
            : "automation_trigger_failed",
        completedAt: new Date(),
      })
      .where(eq(workAutomationRuns.id, history.id));
    await db
      .insert(inboxItems)
      .values({
        workspaceId: input.context.workspaceId,
        userId: automation.createdByUserId,
        type: "work_automation_failed",
        sourceType: "work_automation",
        sourceId: automation.id,
        reason: `L’automatisation ${automation.name} a échoué.`,
      })
      .onConflictDoNothing();
    throw error;
  }
}

export async function listWorkspaceInterventions(workspaceId: string) {
  return db
    .select()
    .from(workInterventions)
    .where(eq(workInterventions.workspaceId, workspaceId))
    .orderBy(desc(workInterventions.createdAt))
    .limit(200);
}

export async function resolveWorkspaceIntervention(input: {
  context: WorkContext;
  interventionId: string;
  decision: "approved" | "rejected" | "answered" | "cancelled";
  answer?: string;
}) {
  const [intervention] = await db
    .select()
    .from(workInterventions)
    .where(
      and(
        eq(workInterventions.id, input.interventionId),
        eq(workInterventions.workspaceId, input.context.workspaceId),
      ),
    )
    .limit(1);
  if (!intervention) throw new WorkNotFoundError("Intervention introuvable.");
  if (intervention.status !== "pending")
    throw new WorkConflictError("Cette intervention est déjà résolue.");
  if (
    (intervention.type === "secret" || intervention.type === "sudo") &&
    input.answer
  ) {
    rememberEphemeralInterventionValue(
      intervention.id,
      input.answer.slice(0, 10_000),
    );
  }
  const [updated] = await db
    .update(workInterventions)
    .set({
      status: input.decision,
      safePayload:
        intervention.type === "clarification" && input.answer
          ? {
              ...intervention.safePayload,
              answer: input.answer.slice(0, 10_000),
            }
          : intervention.safePayload,
      decidedByUserId: input.context.userId,
      decidedAt: new Date(),
    })
    .where(eq(workInterventions.id, intervention.id))
    .returning();
  await db.insert(auditEvents).values({
    tenantId: input.context.tenantId,
    workspaceId: input.context.workspaceId,
    actorUserId: input.context.userId,
    action: "work_intervention.resolved",
    targetType: "work_intervention",
    targetId: intervention.id,
    metadata: { decision: input.decision, type: intervention.type },
  });
  return updated;
}

export async function getWorkTimeline(
  workspaceId: string,
  workItemId: string,
  pagination?: { limit: number; offset: number },
) {
  if (pagination) {
    const [item] = await db
      .select({ id: workItems.id })
      .from(workItems)
      .where(
        and(
          eq(workItems.id, workItemId),
          eq(workItems.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!item) throw new WorkNotFoundError("Tâche introuvable.");
    const limit = Math.min(Math.max(pagination.limit, 1), 200) + 1;
    const offset = Math.min(Math.max(pagination.offset, 0), 100_000);
    const rows = await db.execute<{
      kind: "comment" | "run_event" | "intervention";
      at: Date | string;
      data: Record<string, unknown>;
    }>(sql`
      SELECT 'comment'::text AS kind, comment.created_at AS at, to_jsonb(comment) AS data
      FROM work_item_comments comment
      WHERE comment.work_item_id = ${workItemId}
      UNION ALL
      SELECT 'run_event'::text AS kind, event.occurred_at AS at, to_jsonb(event) AS data
      FROM work_run_events event
      INNER JOIN work_runs run ON run.id = event.run_id
      WHERE run.work_item_id = ${workItemId} AND run.workspace_id = ${workspaceId} AND event.visibility = 'workspace'
      UNION ALL
      SELECT 'intervention'::text AS kind, intervention.created_at AS at, to_jsonb(intervention) AS data
      FROM work_interventions intervention
      WHERE intervention.work_item_id = ${workItemId} AND intervention.workspace_id = ${workspaceId}
      ORDER BY at ASC
      LIMIT ${limit} OFFSET ${offset}
    `);
    return rows.map((row) => ({ ...row, at: new Date(row.at) }));
  }
  const detail = await getWorkspaceWorkItem(workspaceId, workItemId);
  const runIds = detail.runs.map((run) => run.id);
  const events = runIds.length
    ? await db
        .select()
        .from(workRunEvents)
        .where(
          and(
            inArray(workRunEvents.runId, runIds),
            eq(workRunEvents.visibility, "workspace"),
          ),
        )
        .orderBy(asc(workRunEvents.occurredAt))
    : [];
  const timeline = [
    ...detail.comments.map((comment) => ({
      kind: "comment" as const,
      at: comment.createdAt,
      data: comment,
    })),
    ...events.map((event) => ({
      kind: "run_event" as const,
      at: event.occurredAt,
      data: event,
    })),
    ...detail.interventions.map((intervention) => ({
      kind: "intervention" as const,
      at: intervention.createdAt,
      data: intervention,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  return timeline;
}
