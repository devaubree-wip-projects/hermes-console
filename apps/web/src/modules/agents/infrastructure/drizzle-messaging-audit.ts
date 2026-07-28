import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import type { MessagingAuditPort } from "../application/messaging-ports";

export const drizzleMessagingAudit: MessagingAuditPort = {
  async record(input) {
    try {
      await db.insert(auditEvents).values({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        actorUserId: input.userId,
        action: input.action,
        targetType: "agent",
        targetId: input.agentId,
        metadata: input.metadata,
      });
    } catch {
      // Observability must never prevent the requested Hermes action from completing.
    }
  },
};
