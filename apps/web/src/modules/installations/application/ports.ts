import type { InstallationManagementLevel } from "../domain/installation";

export type WorkspaceInstallationContext = {
  userId: string;
  tenantId: string;
  workspaceId: string;
  role: "owner" | "member" | "viewer";
};

export type InstallationProbe = {
  status: "pending_enrollment" | "checking" | "ready" | "degraded" | "offline" | "incompatible" | "upgrading" | "rollback_required" | "revoked";
  statusDetail: string | null;
  statusReason: string | null;
  protocolVersion: number;
  hermesVersion: string | null;
  runtimeKind: "docker" | "systemwide" | "unknown";
  features: string[];
  lifecycle: string[];
  profiles: Array<{ name: string; [key: string]: unknown }>;
  system: Record<string, unknown>;
  lastSeenAt: Date | null;
};

export type InstallationCapacitySample = {
  cpuPercentBasisPoints: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  diskUsedBytes: number | null;
  diskTotalBytes: number | null;
  profileCount: number;
  activeSessionCount: number | null;
  heavyLoads: { browser: number; mcp: number; cron: number; subagents: number };
};

export interface InstallationContextPort {
  resolveWorkspace(params: { tenantSlug: string; workspaceSlug: string }): Promise<WorkspaceInstallationContext | null>;
}

export interface InstallationGatewayPort {
  validateUrl(value: string): string;
  probe(url: string, installationKey: string): Promise<InstallationProbe>;
  testProfile(url: string, installationKey: string, profile: string): Promise<void>;
  capacity(system: Record<string, unknown>, profileCount: number): InstallationCapacitySample;
  isSaturated(sample: InstallationCapacitySample): boolean;
}

export interface InstallationRepositoryPort {
  connect(input: {
    context: WorkspaceInstallationContext;
    name: string;
    installationKey: string;
    gatewayUrl: string;
    managementLevel: InstallationManagementLevel;
    probe: InstallationProbe;
    initialCapacity: InstallationCapacitySample;
    agentId: string;
    profileName: string;
  }): Promise<unknown>;
  classifyError(error: unknown): { message: string; status: number };
}

export type InstallationDependencies = {
  contexts: InstallationContextPort;
  gateway: InstallationGatewayPort;
  repository: InstallationRepositoryPort;
};
