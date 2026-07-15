import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents, auditEvents } from "@/db/schema";
import { CODEX_SUBSCRIPTION_PROVIDER } from "@/lib/hermes/codex-subscription";
import type { CodexMutationPort } from "../application/codex-ports";

export const drizzleCodexMutations: CodexMutationPort = {
  async recordConnected(input) {
    const [existing] = await db.select({ id: auditEvents.id }).from(auditEvents).where(and(
      eq(auditEvents.action, "agent.inference.oauth_connected"),
      eq(auditEvents.targetId, input.agentId),
      sql`${auditEvents.metadata}->>'sessionId' = ${input.sessionId}`,
    )).limit(1);
    if (existing) return;
    await db.insert(auditEvents).values({
      tenantId: input.tenantId, workspaceId: input.workspaceId, actorUserId: input.userId,
      action: "agent.inference.oauth_connected", targetType: "agent", targetId: input.agentId,
      metadata: { provider: CODEX_SUBSCRIPTION_PROVIDER, sessionId: input.sessionId },
    });
  },
  async recordDisconnected(input) {
    await db.insert(auditEvents).values({
      tenantId: input.tenantId, workspaceId: input.workspaceId, actorUserId: input.userId,
      action: "agent.inference.oauth_disconnected", targetType: "agent", targetId: input.agentId,
      metadata: { provider: CODEX_SUBSCRIPTION_PROVIDER },
    });
  },
  async markSetupRequired(agentId) {
    await db.update(agents).set({
      runtimeState: "setup_required", runtimeError: "Abonnement Codex déconnecté.", updatedAt: new Date(),
    }).where(eq(agents.id, agentId));
  },
};
