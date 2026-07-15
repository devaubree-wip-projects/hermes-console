import type { AgentContextPort } from "../domain/agent-context";

export const SUPPORTED_PLATFORMS = ["telegram", "discord"] as const;
export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

export type MessagingPlatform = {
  id: SupportedPlatform;
  name?: string;
  description?: string;
  docs_url?: string;
  enabled?: boolean;
  configured?: boolean;
  gateway_running?: boolean;
  state?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  updated_at?: string | null;
  env_vars?: Array<{ key?: string; is_set?: boolean; [key: string]: unknown }>;
  [key: string]: unknown;
};

export type MessagingState = { gatewayStartCommand: string; platforms: MessagingPlatform[] };

export interface MessagingRuntimePort {
  load(agentId: string, profile: string): Promise<MessagingState>;
  waitForState(agentId: string, profile: string, platform: SupportedPlatform): Promise<MessagingPlatform | undefined>;
  ensureControlExtension(agentId: string, profile: string): Promise<void>;
  configure(input: { agentId: string; profile: string; platform: SupportedPlatform; enabled: boolean; env: Record<string, string> }): Promise<void>;
  lifecycle(agentId: string, profile: string, action: "start" | "restart"): Promise<unknown>;
  test(agentId: string, profile: string, platform: SupportedPlatform): Promise<{ ok?: boolean; state?: string; message?: string }>;
  telegramStart(agentId: string, profile: string, botName: string): Promise<Record<string, unknown>>;
  telegramStatus(agentId: string, profile: string, pairingId: string): Promise<Record<string, unknown>>;
  telegramApply(agentId: string, profile: string, pairingId: string, allowedUserIds: string[]): Promise<Record<string, unknown>>;
  telegramCancel(agentId: string, profile: string, pairingId: string): Promise<Record<string, unknown>>;
  classifyError(error: unknown): { message: string; status: number; safeMessage: string };
}

export interface MessagingAuditPort {
  record(input: {
    tenantId: string;
    workspaceId: string;
    userId: string;
    agentId: string;
    action: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

export type MessagingDependencies = {
  contexts: AgentContextPort;
  runtime: MessagingRuntimePort;
  audit: MessagingAuditPort;
};

export function isSupportedPlatform(value: unknown): value is SupportedPlatform {
  return typeof value === "string" && SUPPORTED_PLATFORMS.includes(value as SupportedPlatform);
}
