import { ensureHermesConsoleControlExtension } from "@/lib/hermes/console-control-extension";
import { clearTelegramTokenLock } from "@/lib/hermes/gateway-locks";
import { runtimeInstallationForAgent } from "@/lib/hermes/installations";
import {
  hermesFetch,
  HermesRuntimeError,
  readLocalProfileGatewayPlatforms,
  runLocalHermesGatewayCommand,
} from "@/lib/hermes/server";
import {
  isProfileGatewayRunning,
  resolvedPlatformError,
  resolvedPlatformState,
} from "@/lib/hermes/messaging-status";
import {
  isSupportedPlatform,
  type MessagingPlatform,
  type MessagingRuntimePort,
  type MessagingState,
} from "../application/messaging-ports";

type PlatformResponse = { gateway_start_command?: string; platforms?: Array<MessagingPlatform | Record<string, unknown>> };
type GatewayTopology = {
  gateway_running?: boolean;
  gateway_platforms?: Record<string, { state?: string | null; error_code?: string | null; error_message?: string | null; updated_at?: string | null }>;
  gateways?: Array<{ profile?: string; served_profiles?: string[] }>;
};

function scopedPath(path: string, profile: string) {
  return `${path}${path.includes("?") ? "&" : "?"}profile=${encodeURIComponent(profile)}`;
}

async function load(agentId: string, profile: string): Promise<MessagingState> {
  const scope = { agentId, profile };
  const [response, topology, localState] = await Promise.all([
    hermesFetch<PlatformResponse>(scopedPath("/api/messaging/platforms", profile), {}, scope),
    hermesFetch<GatewayTopology>(scopedPath("/api/status", profile), {}, scope).catch((): GatewayTopology => ({})),
    readLocalProfileGatewayPlatforms(profile),
  ]);
  const rawPlatforms = (response.platforms ?? []).filter(
    (platform): platform is MessagingPlatform => isSupportedPlatform(platform.id),
  );
  const gatewayRunning = isProfileGatewayRunning({
    profile,
    topology: {
      gatewayRunning: topology.gateway_running,
      gateways: topology.gateways?.map((gateway) => ({ profile: gateway.profile, servedProfiles: gateway.served_profiles })),
    },
    localRunning: localState?.running,
    platformReportedRunning: rawPlatforms.some((platform) => platform.gateway_running === true),
  });
  return {
    gatewayStartCommand: response.gateway_start_command ?? `hermes -p ${profile} gateway start`,
    platforms: rawPlatforms.map((platform) => {
      const topologyState = topology.gateway_platforms?.[platform.id];
      const fallbackState = gatewayRunning ? localState?.platforms[platform.id] : null;
      const runtimeState = topologyState ?? (fallbackState ? {
        state: fallbackState.state,
        error_code: fallbackState.errorCode,
        error_message: fallbackState.errorMessage,
        updated_at: fallbackState.updatedAt,
      } : null);
      return {
        ...platform,
        gateway_running: gatewayRunning,
        state: resolvedPlatformState({
          topologyState: topologyState?.state,
          localState: fallbackState?.state,
          platformState: platform.state,
          gatewayRunning,
          enabled: platform.enabled,
          configured: platform.configured,
        }),
        error_code: resolvedPlatformError({
          runtimeError: runtimeState?.error_code,
          platformError: platform.error_code,
          enabled: platform.enabled,
          configured: platform.configured,
        }),
        error_message: resolvedPlatformError({
          runtimeError: runtimeState?.error_message,
          platformError: platform.error_message,
          enabled: platform.enabled,
          configured: platform.configured,
        }),
        updated_at: runtimeState?.updated_at ?? platform.updated_at,
      };
    }),
  };
}

export const hermesMessagingRuntime: MessagingRuntimePort = {
  load,
  async waitForState(agentId, profile, platformId) {
    const deadline = Date.now() + 12_000;
    let latest: MessagingPlatform | undefined;
    do {
      latest = (await load(agentId, profile)).platforms.find((platform) => platform.id === platformId);
      if (latest?.state === "connected" || latest?.error_message) return latest;
      await new Promise((resolve) => setTimeout(resolve, 400));
    } while (Date.now() < deadline);
    return latest;
  },
  async ensureControlExtension(agentId, profile) {
    await ensureHermesConsoleControlExtension(agentId, profile);
  },
  async configure(input) {
    await hermesFetch(scopedPath(`/api/messaging/platforms/${input.platform}`, input.profile), {
      method: "PUT",
      body: JSON.stringify({ profile: input.profile, enabled: input.enabled, env: input.env }),
    }, { agentId: input.agentId, profile: input.profile });
  },
  lifecycle: runLocalHermesGatewayCommand,
  async reconcileTelegramLock(agentId, profile) {
    const installation = await runtimeInstallationForAgent(agentId);
    return clearTelegramTokenLock(profile, installation);
  },
  async deleteCredential(agentId, profile, key) {
    await hermesFetch("/api/env", {
      method: "DELETE",
      body: JSON.stringify({ key, profile }),
    }, { agentId, profile });
  },
  test(agentId, profile, platform) {
    return hermesFetch(scopedPath(`/api/messaging/platforms/${platform}/test`, profile), { method: "POST" }, { agentId, profile });
  },
  telegramStart(agentId, profile, botName) {
    return hermesFetch(scopedPath("/api/messaging/telegram/onboarding/start", profile), {
      method: "POST", body: JSON.stringify({ bot_name: botName }), signal: AbortSignal.timeout(15_000),
    }, { agentId, profile });
  },
  telegramStatus(agentId, profile, pairingId) {
    return hermesFetch(scopedPath(`/api/messaging/telegram/onboarding/${encodeURIComponent(pairingId)}`, profile), {
      signal: AbortSignal.timeout(15_000),
    }, { agentId, profile });
  },
  telegramApply(agentId, profile, pairingId, allowedUserIds) {
    return hermesFetch(scopedPath(`/api/messaging/telegram/onboarding/${encodeURIComponent(pairingId)}/apply`, profile), {
      method: "POST",
      body: JSON.stringify({ profile, allowed_user_ids: [...new Set(allowedUserIds)] }),
      signal: AbortSignal.timeout(15_000),
    }, { agentId, profile });
  },
  telegramCancel(agentId, profile, pairingId) {
    return hermesFetch(scopedPath(`/api/messaging/telegram/onboarding/${encodeURIComponent(pairingId)}`, profile), {
      method: "DELETE",
    }, { agentId, profile });
  },
  classifyError(error) {
    const message = error instanceof Error ? error.message : "Runtime Hermes indisponible.";
    return {
      message,
      status: error instanceof HermesRuntimeError && error.status ? Math.min(Math.max(error.status, 400), 599) : 503,
      safeMessage: message
        .replace(/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g, "[credential redacted]")
        .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
        .replace(/TELEGRAM_BOT_TOKEN=\S+/gi, "TELEGRAM_BOT_TOKEN=[redacted]")
        .slice(0, 500),
    };
  },
};
