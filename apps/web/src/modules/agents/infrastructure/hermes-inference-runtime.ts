import { hermesFetch, HermesRuntimeError } from "@/lib/hermes/server";
import type { InferenceRuntimePort, RuntimeState } from "../application/inference-ports";

export const hermesInferenceRuntime: InferenceRuntimePort = {
  async load(agentId, profile, refresh = false): Promise<RuntimeState> {
    const encodedProfile = encodeURIComponent(profile);
    const refreshQuery = refresh ? "&refresh=1" : "";
    const scope = { agentId, profile };
    const [env, info, options, oauth, config] = await Promise.all([
      hermesFetch<RuntimeState["env"]>(`/api/env?profile=${encodedProfile}`, {}, scope),
      hermesFetch<RuntimeState["info"]>(`/api/model/info?profile=${encodedProfile}`, {}, scope),
      hermesFetch<RuntimeState["options"]>(
        `/api/model/options?profile=${encodedProfile}&include_unconfigured=1${refreshQuery}`,
        { signal: AbortSignal.timeout(refresh ? 30_000 : 15_000) },
        scope,
      ),
      hermesFetch<RuntimeState["oauth"]>(`/api/providers/oauth?profile=${encodedProfile}`, {}, scope)
        .catch((): RuntimeState["oauth"] => ({ providers: [] })),
      hermesFetch<RuntimeState["config"]>(`/api/config?profile=${encodedProfile}`, {}, scope),
    ]);
    return { env, info, options, oauth, config };
  },
  async updateReasoning(agentId, profile, reasoningEffort) {
    await hermesFetch(`/api/config?profile=${encodeURIComponent(profile)}`, {
      method: "PUT",
      body: JSON.stringify({ profile, config: { agent: { reasoning_effort: reasoningEffort } } }),
    }, { agentId, profile });
  },
  validateCredential(agentId, profile, key, value) {
    return hermesFetch("/api/providers/validate", {
      method: "POST",
      body: JSON.stringify({ key, value, profile }),
      signal: AbortSignal.timeout(15_000),
    }, { agentId, profile });
  },
  async setCredential(agentId, profile, key, value) {
    await hermesFetch("/api/env", {
      method: "PUT",
      body: JSON.stringify({ key, value, profile }),
    }, { agentId, profile });
  },
  async deleteCredential(agentId, profile, key) {
    await hermesFetch("/api/env", {
      method: "DELETE",
      body: JSON.stringify({ key, profile }),
    }, { agentId, profile });
  },
  setModel(input) {
    return hermesFetch("/api/model/set", {
      method: "POST",
      body: JSON.stringify({
        scope: "main",
        provider: input.provider,
        model: input.model,
        profile: input.profile,
        confirm_expensive_model: input.confirmExpensiveModel,
      }),
      signal: AbortSignal.timeout(15_000),
    }, { agentId: input.agentId, profile: input.profile });
  },
  classifyError(error) {
    return {
      message: error instanceof Error ? error.message : "Runtime Hermes indisponible.",
      status: error instanceof HermesRuntimeError && error.status
        ? Math.min(Math.max(error.status, 400), 599)
        : 503,
      notFound: error instanceof HermesRuntimeError && error.status === 404,
    };
  },
};
