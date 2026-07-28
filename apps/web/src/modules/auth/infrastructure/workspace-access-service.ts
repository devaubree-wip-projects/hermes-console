import { createResolveWorkspaceAccess } from "../application/workspace-access";
import { workspaceAccessAdapter } from "./workspace-access-adapter";

export const resolveWorkspaceAccess = createResolveWorkspaceAccess(workspaceAccessAdapter);
