import "server-only";

import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  auditEvents,
  runtimeCapabilities,
  runtimeUsageSamples,
  workspaces,
} from "@/db/schema";
import { publishAgentMission } from "@/lib/hermes/mission-sync";
import {
  resolveAgentProvisioningInstallation,
  RuntimeInstallationSelectionError,
} from "@/lib/hermes/installations";
import { capacityRecommendationFromUsage } from "@/lib/hermes/runtime-policy";
import { createHermesProfile, HermesRuntimeError } from "@/lib/hermes/server";
import { allocateAgentIdentity } from "@/lib/product-model";
import { canConfigureRuntime, type TenantAccess } from "@/lib/workspace";

/**
 * The single writer for "an agent exists". Every surface that can create one —
 * the Console UI, the Telegram `/agent` command, the chat composer — calls this
 * function and nothing else, so the role gate, the tenant ceiling, the runtime
 * capacity checks and the audit trail cannot drift apart between entry points.
 *
 * Provisioning an agent costs a Hermes profile (a cloned skills tree, a session
 * store) and a share of the runtime, so the ceiling is deliberately a product
 * rule enforced here rather than a runtime symptom discovered later.
 */
export const MAX_AGENTS_PER_TENANT = 12;

export const AGENT_NAME_MAX_LENGTH = 80;
export const AGENT_DESCRIPTION_MAX_LENGTH = 500;
export const AGENT_IDEMPOTENCY_KEY_MAX_LENGTH = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AGENT_PROVISIONING_PENDING_MESSAGE = "Provisionnement du profil Hermes en cours.";

/** Carries the status and machine-readable code the calling surface should relay. */
export class AgentCreationError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export type CreateAgentInput = {
  access: TenantAccess;
  actorUserId: string;
  name: string;
  description: string;
  installationId?: string | null;
  sourceAgentId?: string | null;
  idempotencyKey?: string | null;
  /**
   * Where the request came from. It never relaxes a check — it only lands in the
   * audit metadata, so an agent created from a phone is distinguishable from one
   * created in the Console six months later.
   */
  origin: { source: "console" | "telegram" } & Record<string, unknown>;
};

async function assertTenantCeiling(tenantId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(agents)
    .innerJoin(workspaces, eq(workspaces.id, agents.workspaceId))
    .where(eq(workspaces.tenantId, tenantId));
  if ((row?.total ?? 0) >= MAX_AGENTS_PER_TENANT)
    throw new AgentCreationError(
      409,
      `Limite atteinte : ${MAX_AGENTS_PER_TENANT} agents par organisation. Supprimez-en un avant d’en créer un nouveau.`,
      "agent_limit_reached",
    );
}

async function assertRuntimeCapacity(installationId: string) {
  const [[capability], [latestUsage]] = await Promise.all([
    db
      .select()
      .from(runtimeCapabilities)
      .where(eq(runtimeCapabilities.installationId, installationId))
      .limit(1),
    db
      .select()
      .from(runtimeUsageSamples)
      .where(eq(runtimeUsageSamples.installationId, installationId))
      .orderBy(desc(runtimeUsageSamples.sampledAt))
      .limit(1),
  ]);
  if (!latestUsage) return;
  if (
    capability?.limits?.maxActiveSessions
    && (latestUsage.activeSessionCount ?? 0) >= capability.limits.maxActiveSessions
  )
    throw new AgentCreationError(
      409,
      "Capacité de sessions active atteinte.",
      "active_session_capacity_reached",
    );
  if (
    capacityRecommendationFromUsage(latestUsage, capability?.limits?.headroomPercent ?? 20)
      .saturated
  )
    throw new AgentCreationError(
      409,
      "Headroom runtime insuffisant pour créer un nouvel agent.",
      "capacity_headroom_exceeded",
    );
}

function runtimeFailure(error: unknown) {
  return {
    runtimeState: error instanceof HermesRuntimeError && !error.status
      ? "setup_required" as const
      : "error" as const,
    runtimeError: error instanceof Error
      ? error.message.slice(0, 500)
      : "Création du profil Hermes impossible.",
  };
}

function replayValue(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function optionalUuid(
  value: string | null | undefined,
  message: string,
  code: string,
) {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized))
    throw new AgentCreationError(400, message, code);
  return normalized;
}

function assertSameIdempotentRequest(input: {
  existing: typeof agents.$inferSelect;
  creationMetadata: Record<string, unknown> | null;
  name: string;
  description: string;
  installationId?: string | null;
  sourceAgentId?: string | null;
}) {
  const samePayload = input.existing.name === input.name
    && (input.existing.description ?? "") === input.description
    && replayValue(input.creationMetadata, "requestedInstallationId")
      === (input.installationId ?? null)
    && replayValue(input.creationMetadata, "sourceAgentId")
      === (input.sourceAgentId ?? null);
  if (!samePayload)
    throw new AgentCreationError(
      409,
      "Cette clé d’idempotence est déjà liée à une autre demande de création.",
      "idempotency_conflict",
    );
}

async function provisionProfile(input: {
  installationId: string;
  profileName: string;
  description: string;
  allowExisting: boolean;
}) {
  try {
    await createHermesProfile(
      { name: input.profileName, description: input.description },
      { installationId: input.installationId, profile: input.profileName },
    );
  } catch (error) {
    // A previous attempt can have created the profile before losing the
    // response or failing while publishing SOUL.md. The deterministic profile
    // name makes "already exists" a safe resume point for this agent row.
    if (
      !input.allowExisting
      || !(error instanceof HermesRuntimeError)
      || error.status !== 409
    )
      throw error;
  }
  if (input.description)
    await publishAgentMission(
      {
        hermesProfileName: input.profileName,
        installationId: input.installationId,
      },
      input.description,
    );
}

export async function createAgent(input: CreateAgentInput) {
  const { access } = input;
  if (!canConfigureRuntime(access.role))
    throw new AgentCreationError(403, "Seul un Owner peut créer un agent.", "forbidden");

  const name = input.name.trim();
  const description = input.description.trim();
  if (!name || name.length > AGENT_NAME_MAX_LENGTH)
    throw new AgentCreationError(400, "Nom d’agent invalide.", "invalid_name");
  if (description.length > AGENT_DESCRIPTION_MAX_LENGTH)
    throw new AgentCreationError(400, "Mission trop longue.", "invalid_description");

  const rawIdempotencyKey = input.idempotencyKey?.trim() || null;
  if (
    input.idempotencyKey !== undefined
    && input.idempotencyKey !== null
    && (!rawIdempotencyKey || rawIdempotencyKey.length > AGENT_IDEMPOTENCY_KEY_MAX_LENGTH)
  )
    throw new AgentCreationError(
      400,
      "Clé d’idempotence invalide.",
      "invalid_idempotency_key",
    );

  const installationId = optionalUuid(
    input.installationId,
    "Identifiant d’installation invalide.",
    "invalid_installation_id",
  );
  const requestedSourceAgentId = input.sourceAgentId
    ?? (typeof input.origin.requestedByAgentId === "string"
      ? input.origin.requestedByAgentId
      : null);
  const sourceAgentId = optionalUuid(
    requestedSourceAgentId,
    "Identifiant d’agent source invalide.",
    "invalid_source_agent_id",
  );

  try {
    // Phase 1 durably reserves the identity and idempotency key before any
    // external side effect. A crash after Hermes creates the profile therefore
    // leaves a stable row that the next request can resume.
    const reservation = await db.transaction(async (tx) => {
      await tx.execute(sql`
        SELECT pg_advisory_xact_lock(
          hashtext('agent-provisioning'),
          hashtext(${access.workspace.id})
        )
      `);

      const [existing] = rawIdempotencyKey
        ? await tx
            .select()
            .from(agents)
            .where(and(
              eq(agents.workspaceId, access.workspace.id),
              eq(agents.provisioningIdempotencyKey, rawIdempotencyKey),
            ))
            .limit(1)
        : [];

      if (existing) {
        const [creationAudit] = await tx
          .select({ metadata: auditEvents.metadata })
          .from(auditEvents)
          .where(and(
            eq(auditEvents.workspaceId, access.workspace.id),
            eq(auditEvents.action, "agent.created"),
            eq(auditEvents.targetType, "agent"),
            eq(auditEvents.targetId, existing.id),
          ))
          .limit(1);
        if (!creationAudit)
          throw new AgentCreationError(
            409,
            "La demande existante ne peut pas être vérifiée.",
            "idempotency_conflict",
          );
        assertSameIdempotentRequest({
          existing,
          creationMetadata: creationAudit.metadata,
          name,
          description,
          installationId,
          sourceAgentId,
        });
        if (existing.runtimeState === "ready")
          return {
            completed: true as const,
            result: {
              agent: existing,
              runtimeState: existing.runtimeState,
              runtimeError: existing.runtimeError,
              installationId: existing.runtimeInstallationId,
              reused: true,
            },
          };
      }

      const installation = existing?.runtimeInstallationId
        ? await resolveAgentProvisioningInstallation({
            tenantId: access.tenant.id,
            actorUserId: input.actorUserId,
            installationId: existing.runtimeInstallationId,
          })
        : await resolveAgentProvisioningInstallation({
            tenantId: access.tenant.id,
            actorUserId: input.actorUserId,
            installationId,
            sourceAgentId,
          });

      await assertRuntimeCapacity(installation.id);

      let agent = existing;
      if (!agent) {
        await assertTenantCeiling(access.tenant.id);
        const identity = await allocateAgentIdentity(
          access.workspace.id,
          access.tenant.slug,
          access.workspace.slug,
          name,
        );
        [agent] = await tx
          .insert(agents)
          .values({
            workspaceId: access.workspace.id,
            runtimeInstallationId: installation.id,
            provisioningIdempotencyKey: rawIdempotencyKey,
            slug: identity.slug,
            name,
            description: description || null,
            hermesProfileName: identity.profileName,
            runtimeState: "setup_required",
            runtimeError: AGENT_PROVISIONING_PENDING_MESSAGE,
            createdByUserId: input.actorUserId,
          })
          .returning();
        await tx.insert(auditEvents).values({
          tenantId: access.tenant.id,
          workspaceId: access.workspace.id,
          actorUserId: input.actorUserId,
          action: "agent.created",
          targetType: "agent",
          targetId: agent.id,
          metadata: {
            ...input.origin,
            profile: agent.hermesProfileName,
            installationId: installation.id,
            requestedInstallationId: installationId,
            sourceAgentId,
            idempotencyKey: rawIdempotencyKey,
            runtimeState: agent.runtimeState,
          },
        });
      }

      return {
        completed: false as const,
        agent,
        installationId: installation.id,
        reused: Boolean(existing),
      };
    });
    if (reservation.completed) return reservation.result;

    // Phase 2 serializes the remote side effect and its DB finalization. The
    // reservation above survives a rollback or process crash in this phase.
    return await db.transaction(async (tx) => {
      await tx.execute(sql`
        SELECT pg_advisory_xact_lock(
          hashtext('agent-provisioning'),
          hashtext(${access.workspace.id})
        )
      `);
      const [current] = await tx
        .select()
        .from(agents)
        .where(and(
          eq(agents.id, reservation.agent.id),
          eq(agents.workspaceId, access.workspace.id),
        ))
        .limit(1);
      if (!current)
        throw new AgentCreationError(
          409,
          "La réservation de l’agent a disparu.",
          "agent_reservation_missing",
        );
      if (current.runtimeState === "ready")
        return {
          agent: current,
          runtimeState: current.runtimeState,
          runtimeError: current.runtimeError,
          installationId: current.runtimeInstallationId,
          reused: reservation.reused,
        };

      let runtimeState: "ready" | "setup_required" | "error" = "ready";
      let runtimeError: string | null = null;
      try {
        await provisionProfile({
          installationId: reservation.installationId,
          profileName: current.hermesProfileName,
          description: current.description ?? description,
          allowExisting: reservation.reused
            || current.runtimeError !== AGENT_PROVISIONING_PENDING_MESSAGE,
        });
      } catch (error) {
        ({ runtimeState, runtimeError } = runtimeFailure(error));
      }

      const [updated] = await tx
        .update(agents)
        .set({ runtimeState, runtimeError, updatedAt: new Date() })
        .where(eq(agents.id, current.id))
        .returning();

      await tx.insert(auditEvents).values({
        tenantId: access.tenant.id,
        workspaceId: access.workspace.id,
        actorUserId: input.actorUserId,
        action: reservation.reused
          ? "agent.provisioning_retried"
          : "agent.provisioning_completed",
        targetType: "agent",
        targetId: updated.id,
        metadata: {
          ...input.origin,
          profile: updated.hermesProfileName,
          installationId: reservation.installationId,
          requestedInstallationId: installationId,
          sourceAgentId,
          idempotencyKey: rawIdempotencyKey,
          runtimeState,
        },
      });

      return {
        agent: updated,
        runtimeState,
        runtimeError,
        installationId: reservation.installationId,
        reused: reservation.reused,
      };
    });
  } catch (error) {
    if (error instanceof RuntimeInstallationSelectionError)
      throw new AgentCreationError(error.status, error.message, error.code);
    throw error;
  }
}
