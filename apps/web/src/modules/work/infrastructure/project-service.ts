import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, projects, type ProjectStatus } from "@/db/schema";
import { WorkDomainError } from "@/modules/work/domain/work";
import { WorkNotFoundError, type WorkContext } from "./work-service";

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

export async function updateWorkspaceProject(input: {
  context: WorkContext;
  projectId: string;
  name?: string;
  description?: string;
  status?: ProjectStatus;
  dueAt?: Date | null;
}) {
  const [current] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.context.workspaceId),
      ),
    )
    .limit(1);
  if (!current) throw new WorkNotFoundError("Projet introuvable.");
  const [updated] = await db
    .update(projects)
    .set({
      ...(input.name !== undefined
        ? { name: cleanText(input.name, 160, "Le nom") }
        : {}),
      ...(input.description !== undefined
        ? { description: input.description.trim().slice(0, 10_000) }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, current.id))
    .returning();
  await db.insert(auditEvents).values({
    tenantId: input.context.tenantId,
    workspaceId: input.context.workspaceId,
    actorUserId: input.context.userId,
    action: "project.updated",
    targetType: "project",
    targetId: current.id,
    metadata: { status: updated.status },
  });
  return updated;
}

// Hard delete: work_items.projectId and work_automations.projectId are
// ON DELETE SET NULL, and work_resources.projectId is ON DELETE CASCADE,
// so removing a project leaves no orphaned rows.
export async function deleteWorkspaceProject(input: {
  context: WorkContext;
  projectId: string;
}) {
  const [project] = await db
    .delete(projects)
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.context.workspaceId),
      ),
    )
    .returning();
  if (!project) throw new WorkNotFoundError("Projet introuvable.");
  await db.insert(auditEvents).values({
    tenantId: input.context.tenantId,
    workspaceId: input.context.workspaceId,
    actorUserId: input.context.userId,
    action: "project.deleted",
    targetType: "project",
    targetId: project.id,
    metadata: { name: project.name },
  });
  return project;
}
