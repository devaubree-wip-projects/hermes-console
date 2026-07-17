import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import {
  tenantMemberships,
  tenants,
  workspaces,
  type MembershipRole,
  type Tenant,
  type Workspace,
} from "@/db/schema";
import { tenantRoleCan } from "@/lib/tenant-rbac";

export type WorkspaceAccess = {
  tenant: Tenant;
  workspace: Workspace;
  role: MembershipRole;
};

/**
 * Transitional storage shape for the tenant-only product model.
 *
 * Product authorization is exclusively derived from tenant_memberships. The
 * workspace row remains a private 1:1 storage container while workspace_id
 * foreign keys are migrated to tenant_id; it must never alter or deny access.
 */
export type TenantAccess = WorkspaceAccess;

const roleRank: Record<MembershipRole, number> = { viewer: 0, member: 1, owner: 2 };

export function canAtLeast(role: MembershipRole, expected: MembershipRole) {
  return roleRank[role] >= roleRank[expected];
}

export function canApprove(role: MembershipRole) {
  return tenantRoleCan(role, "approve");
}

export function canConfigureRuntime(role: MembershipRole) {
  return tenantRoleCan(role, "runtime");
}

function effectiveTenantRole(row: {
  ownerUserId: string;
  userId: string;
  tenantRole: MembershipRole | null;
}): MembershipRole | null {
  if (row.ownerUserId === row.userId) return "owner";
  return row.tenantRole;
}

/**
 * Compatibility guard for code that still stores tenant data behind a
 * workspace_id. Authorization itself is tenant-only.
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
    })
    .from(workspaces)
    .innerJoin(tenants, eq(workspaces.tenantId, tenants.id))
    .leftJoin(
      tenantMemberships,
      and(eq(tenantMemberships.tenantId, tenants.id), eq(tenantMemberships.userId, userId)),
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
  const role = effectiveTenantRole({ ...row, userId });
  return role ? row.workspace : null;
}

export async function listWorkspacesForUser(userId: string): Promise<Workspace[]> {
  const rows = await db
    .select({
      workspace: workspaces,
      ownerUserId: tenants.ownerUserId,
      tenantRole: tenantMemberships.role,
    })
    .from(workspaces)
    .innerJoin(tenants, eq(workspaces.tenantId, tenants.id))
    .leftJoin(
      tenantMemberships,
      and(eq(tenantMemberships.tenantId, tenants.id), eq(tenantMemberships.userId, userId)),
    )
    .where(or(eq(tenants.ownerUserId, userId), eq(tenantMemberships.userId, userId)))
    .orderBy(asc(workspaces.createdAt));
  return rows
    .filter((row) => effectiveTenantRole({ ...row, userId }) !== null)
    .map((row) => row.workspace);
}

export async function getTenantAccessBySlug(
  tenantSlug: string,
  userId: string,
): Promise<TenantAccess | null> {
  const rows = await db
    .select({
      tenant: tenants,
      workspace: workspaces,
      tenantRole: tenantMemberships.role,
    })
    .from(workspaces)
    .innerJoin(tenants, eq(workspaces.tenantId, tenants.id))
    .leftJoin(
      tenantMemberships,
      and(eq(tenantMemberships.tenantId, tenants.id), eq(tenantMemberships.userId, userId)),
    )
    .where(
      and(
        eq(tenants.slug, tenantSlug),
        or(eq(tenants.ownerUserId, userId), eq(tenantMemberships.userId, userId)),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  const role = effectiveTenantRole({
    ownerUserId: row.tenant.ownerUserId,
    userId,
    tenantRole: row.tenantRole,
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
  return getTenantAccessBySlug(location.tenant.slug, userId);
}

export async function getConsoleDestinationForUser(userId: string): Promise<string> {
  const [workspace] = await listWorkspacesForUser(userId);
  if (!workspace) return "/onboarding";

  const location = await getWorkspaceLocationForUser(workspace.id, userId);
  return location
    ? `/${location.tenant.slug}/dashboard`
    : "/onboarding";
}
