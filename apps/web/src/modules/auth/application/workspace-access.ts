import type { WorkspaceRole } from "../domain/workspace-role";

export type AuthorizedWorkspace = {
  tenantId: string;
  workspaceId: string;
  role: WorkspaceRole;
};

export interface WorkspaceAccessRepository {
  findBySlugs(input: { tenantSlug: string; workspaceSlug: string; userId: string }): Promise<AuthorizedWorkspace | null>;
}

export function createResolveWorkspaceAccess(repository: WorkspaceAccessRepository) {
  return (input: { tenantSlug: string; workspaceSlug: string; userId: string }) => repository.findBySlugs(input);
}
