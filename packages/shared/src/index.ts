export * from "./gateway";

export type PublicErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "conflict"
  | "runtime_unavailable"
  | "internal_error";

export type PublicError = {
  error: string;
  code?: PublicErrorCode;
};

export type WorkspaceRouteParams = {
  tenantSlug: string;
  workspaceSlug: string;
};

export type AgentRouteParams = WorkspaceRouteParams & {
  agentSlug: string;
};

export type InstallationRouteParams = WorkspaceRouteParams & {
  installationId: string;
};
