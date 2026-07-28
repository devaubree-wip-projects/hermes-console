import { getTenantAccessBySlug } from "@/lib/workspace";
import type { WorkspaceAccessRepository } from "../application/workspace-access";

export const workspaceAccessAdapter: WorkspaceAccessRepository = {
  async findByTenantSlug(input) {
    const access = await getTenantAccessBySlug(input.tenantSlug, input.userId);
    return access ? {
      tenantId: access.tenant.id,
      workspaceId: access.workspace.id,
      role: access.role,
    } : null;
  },
};
