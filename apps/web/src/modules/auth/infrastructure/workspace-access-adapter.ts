import { getWorkspaceAccessBySlugs } from "@/lib/workspace";
import type { WorkspaceAccessRepository } from "../application/workspace-access";

export const workspaceAccessAdapter: WorkspaceAccessRepository = {
  async findBySlugs(input) {
    const access = await getWorkspaceAccessBySlugs(input.tenantSlug, input.workspaceSlug, input.userId);
    return access ? {
      tenantId: access.tenant.id,
      workspaceId: access.workspace.id,
      role: access.role,
    } : null;
  },
};
