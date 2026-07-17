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

export type TenantRouteParams = {
  tenantSlug: string;
};

export type AgentRouteParams = TenantRouteParams & {
  agentSlug: string;
};

export type InstallationRouteParams = TenantRouteParams & {
  installationId: string;
};
