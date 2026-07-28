import { CODEX_SUBSCRIPTION_PROVIDER, createCodexSubscriptionService } from "@/lib/hermes/codex-subscription";
import { hermesFetch, HermesRuntimeError } from "@/lib/hermes/server";
import type { CodexRuntimePort } from "../application/codex-ports";

function service(agentId: string, profile: string) {
  return createCodexSubscriptionService(<T>(path: string, init?: RequestInit) => hermesFetch<T>(path, init, { agentId, profile }));
}

export const hermesCodexRuntime: CodexRuntimePort = {
  start(agentId, profile) { return service(agentId, profile).start(profile); },
  poll(agentId, profile, sessionId) { return service(agentId, profile).poll(profile, sessionId); },
  cancel(agentId, profile, sessionId) { return service(agentId, profile).cancel(profile, sessionId); },
  disconnect(agentId, profile) { return service(agentId, profile).disconnect(profile); },
  async usesCodex(agentId, profile) {
    const info = await hermesFetch<{ provider?: string; model?: string }>(
      `/api/model/info?${new URLSearchParams({ profile })}`, {}, { agentId, profile },
    );
    return info.provider === CODEX_SUBSCRIPTION_PROVIDER || info.model?.startsWith(`${CODEX_SUBSCRIPTION_PROVIDER}/`) === true;
  },
  classifyError(error) {
    return {
      message: error instanceof Error ? error.message : "Runtime Hermes indisponible.",
      status: error instanceof HermesRuntimeError && error.status ? Math.min(Math.max(error.status, 400), 599) : 503,
      notFound: error instanceof HermesRuntimeError && error.status === 404,
    };
  },
};
