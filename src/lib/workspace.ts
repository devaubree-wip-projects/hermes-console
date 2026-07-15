import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import {
  tenantMemberships,
  tenants,
  workspaceMemberships,
  workspaces,
  type MembershipRole,
  type Tenant,
  type Workspace,
} from "@/db/schema";

export type WorkspaceAccess = {
  tenant: Tenant;
  workspace: Workspace;
  role: MembershipRole;
};

const roleRank: Record<MembershipRole, number> = { viewer: 0, member: 1, owner: 2 };

export function canAtLeast(role: MembershipRole, expected: MembershipRole) {
  return roleRank[role] >= roleRank[expected];
}

export function canApprove(role: MembershipRole) {
  return role === "owner" || role === "member";
}

export function canConfigureRuntime(role: MembershipRole) {
  return role === "owner";
}

function effectiveRole(row: {
  ownerUserId: string;
  userId: string;
  tenantRole: MembershipRole | null;
  workspaceRole: MembershipRole | null;
  denied: boolean | null;
}): MembershipRole | null {
  if (row.denied) return null;
  if (row.ownerUserId === row.userId) return "owner";
  return row.workspaceRole ?? row.tenantRole;
}

/**
 * Authorization guard: every workspace-scoped read/write MUST go through one
 * of these helpers so a user can only ever touch workspaces of tenants they own.
 */
export async function getWorkspaceForUser(
  workspaceId: string,
  userId: string,
): Promise<Workspace | null> {
  const rows = await db
    .select({
      workspace: workspaces,
      ownerUserId: tenants.ownerUserId,
      tenantRole: tenantMemberships.role,
      workspaceRole: workspaceMemberships.role,
      denied: workspaceMemberships.denied,
    })
    .from(workspaces)
    .innerJoin(tenants, eq(workspaces.tenantId, tenants.id))
    .leftJoin(
      tenantMemberships,
      and(eq(tenantMemberships.tenantId, tenants.id), eq(tenantMemberships.userId, userId)),
    )
    .leftJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.workspaceId, workspaces.id),
        eq(workspaceMemberships.userId, userId),
      ),
    )
    .where(
      and(
        eq(workspaces.id, workspaceId),
        or(eq(tenants.ownerUserId, userId), eq(tenantMemberships.userId, userId)),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const role = effectiveRole({ ...row, userId });
  return role ? row.workspace : null;
}

export async function listWorkspacesForUser(userId: string): Promise<Workspace[]> {
  const rows = await db
    .select({
      workspace: workspaces,
      ownerUserId: tenants.ownerUserId,
      tenantRole: tenantMemberships.role,
      workspaceRole: workspaceMemberships.role,
      denied: workspaceMemberships.denied,
    })
    .from(workspaces)
    .innerJoin(tenants, eq(workspaces.tenantId, tenants.id))
    .leftJoin(
      tenantMemberships,
      and(eq(tenantMemberships.tenantId, tenants.id), eq(tenantMemberships.userId, userId)),
    )
    .leftJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.workspaceId, workspaces.id),
        eq(workspaceMemberships.userId, userId),
      ),
    )
    .where(or(eq(tenants.ownerUserId, userId), eq(tenantMemberships.userId, userId)))
    .orderBy(asc(workspaces.createdAt));
  return rows
    .filter((row) => effectiveRole({ ...row, userId }) !== null)
    .map((row) => row.workspace);
}

export async function getWorkspaceAccessBySlugs(
  tenantSlug: string,
  workspaceSlug: string,
  userId: string,
): Promise<WorkspaceAccess | null> {
  const rows = await db
    .select({
      tenant: tenants,
      workspace: workspaces,
      tenantRole: tenantMemberships.role,
      workspaceRole: workspaceMemberships.role,
      denied: workspaceMemberships.denied,
    })
    .from(workspaces)
    .innerJoin(tenants, eq(workspaces.tenantId, tenants.id))
    .leftJoin(
      tenantMemberships,
      and(eq(tenantMemberships.tenantId, tenants.id), eq(tenantMemberships.userId, userId)),
    )
    .leftJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.workspaceId, workspaces.id),
        eq(workspaceMemberships.userId, userId),
      ),
    )
    .where(
      and(
        eq(tenants.slug, tenantSlug),
        eq(workspaces.slug, workspaceSlug),
        or(eq(tenants.ownerUserId, userId), eq(tenantMemberships.userId, userId)),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  const role = effectiveRole({
    ownerUserId: row.tenant.ownerUserId,
    userId,
    tenantRole: row.tenantRole,
    workspaceRole: row.workspaceRole,
    denied: row.denied,
  });
  return role ? { tenant: row.tenant, workspace: row.workspace, role } : null;
}

export async function getWorkspaceLocationForUser(workspaceId: string, userId: string) {
  const workspace = await getWorkspaceForUser(workspaceId, userId);
  if (!workspace) return null;
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, workspace.tenantId)).limit(1);
  return tenant ? { tenant, workspace } : null;
}

export async function getWorkspaceAccessForUserById(workspaceId: string, userId: string) {
  const location = await getWorkspaceLocationForUser(workspaceId, userId);
  if (!location) return null;
  return getWorkspaceAccessBySlugs(location.tenant.slug, location.workspace.slug, userId);
}

export async function getConsoleDestinationForUser(userId: string): Promise<string> {
  const [workspace] = await listWorkspacesForUser(userId);
  if (!workspace) return "/onboarding";

  const location = await getWorkspaceLocationForUser(workspace.id, userId);
  return location
    ? `/${location.tenant.slug}/${location.workspace.slug}/dashboard`
    : "/onboarding";
}
