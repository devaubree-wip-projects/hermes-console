import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  agentTeamMembers,
  agentTeams,
  authSessions,
  passwordResetTokens,
  runtimeInstallations,
  tenantMemberships,
  tenants,
  users,
  workInterventions,
  workRunEvents,
  workRunPlanRevisions,
  workRunPlanSteps,
  workRuns,
  workspaces,
} from "@/db/schema";

/**
 * Permanently delete a tenant and everything under it. Most tables cascade from
 * tenant/workspace, but several rows hold ON DELETE RESTRICT references (runs,
 * teams and interventions -> agents; agents/runs -> installations; plan steps ->
 * plan revisions). Those are removed first, in dependency order, so the final
 * tenant delete can cascade the remainder without hitting a constraint.
 */
export async function deleteTenantAndData(tenantId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const workspaceRows = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.tenantId, tenantId));
    const workspaceIds = workspaceRows.map((row) => row.id);

    if (workspaceIds.length) {
      const runRows = await tx
        .select({ id: workRuns.id })
        .from(workRuns)
        .where(inArray(workRuns.workspaceId, workspaceIds));
      const runIds = runRows.map((row) => row.id);
      if (runIds.length) {
        await tx.delete(workRunPlanSteps).where(inArray(workRunPlanSteps.runId, runIds));
        await tx.delete(workRunPlanRevisions).where(inArray(workRunPlanRevisions.runId, runIds));
        await tx.delete(workRunEvents).where(inArray(workRunEvents.runId, runIds));
      }
      await tx.delete(workInterventions).where(inArray(workInterventions.workspaceId, workspaceIds));
      await tx.delete(workRuns).where(inArray(workRuns.workspaceId, workspaceIds));

      const teamRows = await tx
        .select({ id: agentTeams.id })
        .from(agentTeams)
        .where(inArray(agentTeams.workspaceId, workspaceIds));
      const teamIds = teamRows.map((row) => row.id);
      if (teamIds.length) {
        await tx.delete(agentTeamMembers).where(inArray(agentTeamMembers.teamId, teamIds));
      }
      await tx.delete(agentTeams).where(inArray(agentTeams.workspaceId, workspaceIds));
      await tx.delete(agents).where(inArray(agents.workspaceId, workspaceIds));
    }

    // Installations reference the tenant (cascade) but were restrict-referenced by
    // the agents/runs just removed; safe to drop now before the tenant cascade.
    await tx.delete(runtimeInstallations).where(eq(runtimeInstallations.tenantId, tenantId));
    await tx.delete(tenants).where(eq(tenants.id, tenantId));
  });
}

/**
 * GDPR erasure for a user account: delete every organization they own (full data
 * removal), drop their memberships/sessions/reset tokens, then delete the user
 * row. If contributions in organizations they don't own still hold restrict
 * references, the row is anonymized instead (PII scrubbed, login disabled) — a
 * valid erasure that preserves referential integrity of others' data.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const owned = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.ownerUserId, userId));
  for (const tenant of owned) {
    await deleteTenantAndData(tenant.id);
  }
  await db.delete(tenantMemberships).where(eq(tenantMemberships.userId, userId));
  await db.delete(authSessions).where(eq(authSessions.userId, userId));
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  try {
    await db.delete(users).where(eq(users.id, userId));
  } catch {
    await db
      .update(users)
      .set({
        email: `deleted-${userId}@deleted.invalid`,
        name: "Compte supprimé",
        passwordHash: "deleted",
        onboardingData: null,
      })
      .where(eq(users.id, userId));
  }
}
