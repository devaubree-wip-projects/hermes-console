import { ALL_REASONING_CONTROL_IDS, getReasoningControlConfig, normalizeReasoningControlId } from "@/components/shared/chat/constants/reasoning-config";
import { canConfigureAgentRuntime, type AgentContextParams, type AgentRuntimeContext } from "../domain/agent-context";
import { result, type ApplicationResult } from "./application-result";
import type {
  HermesEnvRow,
  HermesModelProvider,
  InferenceDependencies,
  RuntimeState,
} from "./inference-ports";

const REASONING_EFFORTS = new Set<string>(ALL_REASONING_CONTROL_IDS);

function modelNames(provider: HermesModelProvider) {
  return (provider.models ?? []).map((model) => {
    if (typeof model === "string") return model;
    if (model && typeof model === "object" && "id" in model) {
      const id = (model as { id?: unknown }).id;
      return typeof id === "string" ? id : "";
    }
    return "";
  }).filter((model, index, all) => Boolean(model) && all.indexOf(model) === index);
}

function canonicalModelName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function catalogModelName(provider: HermesModelProvider | undefined, currentModel: string) {
  if (!provider || !currentModel) return currentModel;
  const canonicalCurrent = canonicalModelName(currentModel);
  return modelNames(provider).find((model) => canonicalModelName(model) === canonicalCurrent) ?? currentModel;
}

function credentialForProvider(env: Record<string, HermesEnvRow>, provider: string) {
  const rows = Object.entries(env).filter(([, row]) => row.provider === provider && row.is_password === true);
  return rows.find(([, row]) => row.is_set === true) ?? rows[0] ?? null;
}

function resolvedCurrentProvider(info: RuntimeState["info"], providers: HermesModelProvider[]) {
  const explicit = (info.provider ?? "").trim();
  if (explicit && explicit !== "auto") return explicit;
  const rawModel = (info.model ?? "").trim();
  const prefix = rawModel.includes("/") ? rawModel.split("/", 1)[0] : "";
  if (prefix && providers.some((provider) => provider.slug === prefix)) return prefix;
  const bareModel = rawModel.includes("/") ? rawModel.slice(rawModel.indexOf("/") + 1) : rawModel;
  return providers.find((provider) => modelNames(provider).includes(bareModel))?.slug ?? explicit;
}

function clientState(context: AgentRuntimeContext, runtime: RuntimeState, canEdit: boolean) {
  const agent = context.agent!;
  const oauthById = new Map((runtime.oauth.providers ?? [])
    .filter((provider): provider is NonNullable<RuntimeState["oauth"]["providers"]>[number] & { id: string } => Boolean(provider.id))
    .map((provider) => [provider.id, provider]));
  const rawProviders = (runtime.options.providers ?? [])
    .filter((provider): provider is HermesModelProvider & { slug: string } => Boolean(provider.slug));
  const currentProvider = resolvedCurrentProvider(runtime.info, rawProviders);
  const rawCurrentModel = runtime.info.model ?? "";
  const bareCurrentModel = currentProvider && rawCurrentModel.startsWith(`${currentProvider}/`)
    ? rawCurrentModel.slice(currentProvider.length + 1)
    : rawCurrentModel;
  const currentModel = catalogModelName(rawProviders.find((provider) => provider.slug === currentProvider), bareCurrentModel);
  return {
    agent: { id: agent.id, name: agent.name, slug: agent.slug },
    canEdit,
    currentProvider,
    currentModel,
    currentReasoningEffort: (() => {
      const raw = String(runtime.config.agent?.reasoning_effort);
      const provider = resolvedCurrentProvider(runtime.info, rawProviders);
      const bareModel = (() => {
        const rawCurrentModel = runtime.info.model ?? "";
        return provider && rawCurrentModel.startsWith(`${provider}/`)
          ? rawCurrentModel.slice(provider.length + 1)
          : rawCurrentModel;
      })();
      const model = catalogModelName(rawProviders.find((item) => item.slug === provider), bareModel);
      return normalizeReasoningControlId(provider, model, REASONING_EFFORTS.has(raw) ? raw : undefined)
        ?? "medium";
    })(),
    providers: rawProviders.map((provider) => {
      const credential = credentialForProvider(runtime.env, provider.slug);
      const oauth = oauthById.get(provider.slug);
      const authenticated = provider.authenticated === true || oauth?.status?.logged_in === true;
      const setupMode = credential ? "credential" : oauth?.flow === "external" ? "external" : oauth ? "oauth" : authenticated ? "none" : "advanced";
      return {
        id: provider.slug,
        name: provider.name || provider.slug,
        models: modelNames(provider),
        authenticated,
        setupMode,
        credentialConfigured: credential?.[1].is_set === true,
        credentialUrl: credential?.[1].url || null,
        oauthFlow: oauth?.flow || null,
        oauthLoggedIn: oauth?.status?.logged_in === true,
        docsUrl: oauth?.docs_url || credential?.[1].url || null,
        capabilities: provider.capabilities ?? {},
      };
    }),
  };
}

async function contextResult(dependencies: InferenceDependencies, params: AgentContextParams) {
  const context = await dependencies.contexts.resolve(params);
  if (!context) return result({ error: "Workspace introuvable." }, 404);
  if (!context.agent) return result({ error: "Agent introuvable." }, 404);
  return context;
}

function isApplicationResult(value: AgentRuntimeContext | ApplicationResult): value is ApplicationResult {
  return "status" in value;
}

function runtimeFailure(dependencies: InferenceDependencies, error: unknown) {
  const failure = dependencies.runtime.classifyError(error);
  return result({ error: failure.message }, failure.status);
}

export function createInferenceUseCases(dependencies: InferenceDependencies) {
  return {
    async get(params: AgentContextParams, refresh = true) {
      const resolved = await contextResult(dependencies, params);
      if (isApplicationResult(resolved)) return resolved;
      try {
        const runtime = await dependencies.runtime.load(
          resolved.agent!.id,
          resolved.agent!.hermesProfileName,
          refresh,
        );
        return result(clientState(resolved, runtime, canConfigureAgentRuntime(resolved)));
      } catch (error) {
        return runtimeFailure(dependencies, error);
      }
    },

    async update(params: AgentContextParams, body: Record<string, unknown> | null) {
      const context = await contextResult(dependencies, params);
      if (isApplicationResult(context)) return context;
      if (!canConfigureAgentRuntime(context)) {
        return result({ error: "Seul un Owner peut configurer l’inférence." }, 403);
      }
      const agent = context.agent!;
      const mode = body?.mode === "credential" ? "credential" : body?.mode === "reasoning" ? "reasoning" : "model";
      const provider = typeof body?.provider === "string" ? body.provider.trim() : "";
      const credential = typeof body?.credential === "string" ? body.credential.trim() : "";
      const model = typeof body?.model === "string" ? body.model.trim() : "";
      const reasoningEffort = typeof body?.reasoningEffort === "string" ? body.reasoningEffort.trim().toLowerCase() : "";
      const confirmExpensiveModel = body?.confirmExpensiveModel === true;
      if (mode !== "reasoning" && (!provider || provider.length > 100)) return result({ error: "Fournisseur invalide." }, 400);
      if (credential.length > 20_000) return result({ error: "Identifiant fournisseur invalide." }, 400);

      try {
        const runtime = await dependencies.runtime.load(agent.id, agent.hermesProfileName);
        if (mode === "reasoning") {
          const provider = resolvedCurrentProvider(runtime.info, runtime.options.providers ?? []);
          const bareModel = (() => {
            const rawCurrentModel = runtime.info.model ?? "";
            return provider && rawCurrentModel.startsWith(`${provider}/`)
              ? rawCurrentModel.slice(provider.length + 1)
              : rawCurrentModel;
          })();
          const model = catalogModelName(
            runtime.options.providers?.find((item) => item.slug === provider),
            bareModel,
          );
          const effortConfig = getReasoningControlConfig(provider, model);
          if (!effortConfig || !effortConfig.options.some((option) => option.id === reasoningEffort)) {
            return result({ error: "Effort de raisonnement invalide pour ce modèle." }, 400);
          }
          await dependencies.runtime.updateReasoning(agent.id, agent.hermesProfileName, reasoningEffort);
          await dependencies.mutations.audit({
            tenantId: context.tenantId, workspaceId: context.workspaceId, userId: context.userId, agentId: agent.id,
            action: "agent.inference.reasoning_updated", metadata: { reasoningEffort },
          });
          return result({ ok: true, reasoningEffort });
        }
        const providerRow = runtime.options.providers?.find((item) => item.slug === provider);
        if (!providerRow) return result({ error: "Ce fournisseur n’est pas proposé par Hermes." }, 400);

        if (mode === "credential") {
          const credentialRow = credentialForProvider(runtime.env, provider);
          if (!credentialRow) return result({ error: "Ce fournisseur n’accepte pas d’identifiant direct." }, 400);
          if (!credential) return result({ error: "Ajoutez l’identifiant demandé par ce fournisseur." }, 400);
          const validation = await dependencies.runtime.validateCredential(agent.id, agent.hermesProfileName, credentialRow[0], credential);
          if (validation.ok !== true && validation.reachable === true) {
            return result({ error: validation.message || "Cet identifiant a été refusé par le fournisseur." }, 422);
          }
          await dependencies.runtime.setCredential(agent.id, agent.hermesProfileName, credentialRow[0], credential);
          const refreshed = await dependencies.runtime.load(agent.id, agent.hermesProfileName, true);
          await dependencies.mutations.audit({
            tenantId: context.tenantId, workspaceId: context.workspaceId, userId: context.userId, agentId: agent.id,
            action: "agent.inference.credential_updated", metadata: { provider },
          });
          return result({
            ok: true,
            state: clientState(context, refreshed, true),
            warning: validation.reachable === false ? validation.message || "Identifiant enregistré sans validation automatique." : null,
          });
        }

        if (!model || model.length > 200 || !modelNames(providerRow).includes(model)) {
          return result({ error: "Ce modèle n’est pas proposé par le fournisseur sélectionné." }, 400);
        }
        const effortConfig = getReasoningControlConfig(provider, model);
        if (reasoningEffort) {
          if (!effortConfig || !effortConfig.options.some((option) => option.id === reasoningEffort)) {
            return result({ error: "Effort de raisonnement invalide pour ce modèle." }, 400);
          }
        }
        const assignment = await dependencies.runtime.setModel({
          agentId: agent.id, profile: agent.hermesProfileName, provider, model, confirmExpensiveModel,
        });
        if (assignment.confirm_required) {
          return result({ error: assignment.confirm_message || "Ce modèle nécessite une confirmation de coût.", confirmRequired: true }, 409);
        }
        if (assignment.ok === false) return result({ error: assignment.confirm_message || "Hermes a refusé ce modèle." }, 422);
        if (reasoningEffort) {
          if (!effortConfig || !effortConfig.options.some((option) => option.id === reasoningEffort)) {
            return result({ error: "Effort de raisonnement invalide pour ce modèle." }, 400);
          }
          await dependencies.runtime.updateReasoning(agent.id, agent.hermesProfileName, reasoningEffort);
        }
        await dependencies.mutations.markReady(agent.id);
        await dependencies.mutations.audit({
          tenantId: context.tenantId, workspaceId: context.workspaceId, userId: context.userId, agentId: agent.id,
          action: "agent.inference.updated", metadata: { provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) },
        });
        return result({ ok: true, provider, model, reasoningEffort: reasoningEffort || undefined });
      } catch (error) {
        return runtimeFailure(dependencies, error);
      }
    },

    async removeCredential(params: AgentContextParams, body: Record<string, unknown> | null) {
      const context = await contextResult(dependencies, params);
      if (isApplicationResult(context)) return context;
      if (!canConfigureAgentRuntime(context)) {
        return result({ error: "Seul un Owner peut retirer un identifiant d’inférence." }, 403);
      }
      const provider = typeof body?.provider === "string" ? body.provider.trim() : "";
      if (!provider) return result({ error: "Fournisseur invalide." }, 400);
      const agent = context.agent!;
      try {
        const runtime = await dependencies.runtime.load(agent.id, agent.hermesProfileName);
        const credentialRow = credentialForProvider(runtime.env, provider);
        if (!credentialRow || credentialRow[1].is_set !== true) return result({ ok: true, state: clientState(context, runtime, true) });
        await dependencies.runtime.deleteCredential(agent.id, agent.hermesProfileName, credentialRow[0]);
        if (resolvedCurrentProvider(runtime.info, runtime.options.providers ?? []) === provider) {
          await dependencies.mutations.markSetupRequired(agent.id, "Identifiant du fournisseur retiré.");
        }
        await dependencies.mutations.audit({
          tenantId: context.tenantId, workspaceId: context.workspaceId, userId: context.userId, agentId: agent.id,
          action: "agent.inference.credential_removed", metadata: { provider },
        });
        const refreshed = await dependencies.runtime.load(agent.id, agent.hermesProfileName, true);
        return result({ ok: true, state: clientState(context, refreshed, true) });
      } catch (error) {
        const failure = dependencies.runtime.classifyError(error);
        return failure.notFound ? result({ ok: true }) : result({ error: failure.message }, failure.status);
      }
    },
  };
}
