import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants, workspaces, type Workspace } from "@/db/schema";

/**
 * Authorization guard: every workspace-scoped read/write MUST go through one
 * of these helpers so a user can only ever touch workspaces of tenants they own.
 */
export async function getWorkspaceForUser(
  workspaceId: string,
  userId: string,
): Promise<Workspace | null> {
  const rows = await db
    .select({ workspace: workspaces })
    .from(workspaces)
    .innerJoin(tenants, eq(workspaces.tenantId, tenants.id))
    .where(and(eq(workspaces.id, workspaceId), eq(tenants.ownerUserId, userId)))
    .limit(1);
  return rows[0]?.workspace ?? null;
}

export async function listWorkspacesForUser(userId: string): Promise<Workspace[]> {
  const rows = await db
    .select({ workspace: workspaces })
    .from(workspaces)
    .innerJoin(tenants, eq(workspaces.tenantId, tenants.id))
    .where(eq(tenants.ownerUserId, userId))
    .orderBy(workspaces.createdAt);
  return rows.map((r) => r.workspace);
}
