export type WorkspaceRole = "owner" | "member" | "viewer";

const ROLE_RANK: Record<WorkspaceRole, number> = { viewer: 0, member: 1, owner: 2 };

export function roleCanAtLeast(role: WorkspaceRole, expected: WorkspaceRole) {
  return ROLE_RANK[role] >= ROLE_RANK[expected];
}

export function roleCanConfigureRuntime(role: WorkspaceRole) {
  return role === "owner";
}
