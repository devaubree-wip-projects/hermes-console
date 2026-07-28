import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  workAutomations,
  type WorkAutomationStatus,
} from "@/db/schema";
import { WorkNotFoundError, type WorkContext } from "./work-service";

export async function updateWorkspaceAutomation(input: {
  context: WorkContext;
  automationId: string;
  status: WorkAutomationStatus;
}) {
  const [current] = await db
    .select()
    .from(workAutomations)
    .where(
      and(
        eq(workAutomations.id, input.automationId),
        eq(workAutomations.workspaceId, input.context.workspaceId),
      ),
    )
    .limit(1);
  if (!current) throw new WorkNotFoundError("Automatisation introuvable.");
  const [updated] = await db
    .update(workAutomations)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(workAutomations.id, current.id))
    .returning();
  await db.insert(auditEvents).values({
    tenantId: input.context.tenantId,
    workspaceId: input.context.workspaceId,
    actorUserId: input.context.userId,
    action: "automation.updated",
    targetType: "automation",
    targetId: current.id,
    metadata: { status: updated.status },
  });
  return updated;
}

export async function deleteWorkspaceAutomation(input: {
  context: WorkContext;
  automationId: string;
}) {
  const [automation] = await db
    .delete(workAutomations)
    .where(
      and(
        eq(workAutomations.id, input.automationId),
        eq(workAutomations.workspaceId, input.context.workspaceId),
      ),
    )
    .returning();
  if (!automation) throw new WorkNotFoundError("Automatisation introuvable.");
  await db.insert(auditEvents).values({
    tenantId: input.context.tenantId,
    workspaceId: input.context.workspaceId,
    actorUserId: input.context.userId,
    action: "automation.deleted",
    targetType: "automation",
    targetId: automation.id,
    metadata: { name: automation.name },
  });
  return automation;
}
