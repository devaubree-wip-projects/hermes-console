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

/**
 * Résultat d'une sonde `getChat`, en lecture seule.
 * - `unreachable` : preuve d'échec (chat introuvable, bot bloqué) — c'est le seul
 *   statut sur lequel on agit, et l'incident qu'on corrige (« Chat not found »).
 * - `reachable` : la conversation existe et le bot la résout. `getChat` ne garantit
 *   pas pour autant que `sendMessage` soit autorisé — c'est une condition nécessaire,
 *   pas suffisante. Ne pas en déduire une livraison certaine.
 * - `unknown` : sonde indéterminée (réseau, quota, incident Telegram) — ne prouve rien.
 */
export type TelegramReachability = { chatId: string; status: "reachable" | "unreachable" | "unknown"; reason?: string };

export interface MessagingRuntimePort {
  load(agentId: string, profile: string): Promise<MessagingState>;
  /** `since` = `updated_at` relevé avant la commande lifecycle : sert à exiger une transition, pas un état. */
  waitForState(agentId: string, profile: string, platform: SupportedPlatform, since?: string | null): Promise<MessagingPlatform | undefined>;
  ensureControlExtension(agentId: string, profile: string): Promise<void>;
  configure(input: { agentId: string; profile: string; platform: SupportedPlatform; enabled: boolean; env: Record<string, string> }): Promise<void>;
  lifecycle(agentId: string, profile: string, action: "start" | "restart"): Promise<unknown>;
  reconcileTelegramLock(agentId: string, profile: string): Promise<{ status: "cleared" | "none" | "ambiguous" | "conflict" | "unsupported"; reason?: string; count?: number; profile?: string }>;
  deleteCredential(agentId: string, profile: string, key: string): Promise<void>;
  test(agentId: string, profile: string, platform: SupportedPlatform): Promise<{ ok?: boolean; state?: string; message?: string }>;
  telegramStart(agentId: string, profile: string, botName: string): Promise<Record<string, unknown>>;
  telegramStatus(agentId: string, profile: string, pairingId: string): Promise<Record<string, unknown>>;
  telegramApply(agentId: string, profile: string, pairingId: string, allowedUserIds: string[]): Promise<Record<string, unknown>>;
  telegramCancel(agentId: string, profile: string, pairingId: string): Promise<Record<string, unknown>>;
  /** Sonde en lecture seule (getChat) : n'envoie aucun message à l'utilisateur. */
  probeTelegramReachability(token: string, chatIds: string[]): Promise<TelegramReachability[]>;
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
