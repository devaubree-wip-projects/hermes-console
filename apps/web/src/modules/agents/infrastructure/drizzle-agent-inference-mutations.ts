import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, auditEvents } from "@/db/schema";
import type { AgentInferenceMutationPort } from "../application/inference-ports";

export const drizzleAgentInferenceMutations: AgentInferenceMutationPort = {
  async markReady(agentId) {
    await db.update(agents).set({ runtimeState: "ready", runtimeError: null, updatedAt: new Date() }).where(eq(agents.id, agentId));
  },
  async markSetupRequired(agentId, reason) {
    await db.update(agents).set({ runtimeState: "setup_required", runtimeError: reason, updatedAt: new Date() }).where(eq(agents.id, agentId));
  },
  async audit(input) {
    await db.insert(auditEvents).values({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      action: input.action,
      targetType: "agent",
      targetId: input.agentId,
      metadata: input.metadata,
    });
  },
};
