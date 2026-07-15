import { requireUser } from "@/lib/auth";
import { resolveWorkspaceAccess } from "@/modules/auth/infrastructure/workspace-access-service";
import type { InstallationContextPort } from "../application/ports";

export const installationContextRepository: InstallationContextPort = {
  async resolveWorkspace(params) {
    const user = await requireUser();
    const access = await resolveWorkspaceAccess({ ...params, userId: user.id });
    return access ? {
      userId: user.id,
      tenantId: access.tenantId,
      workspaceId: access.workspaceId,
      role: access.role,
    } : null;
  },
};
