import { canConfigureAgentRuntime, type AgentContextParams, type AgentRuntimeContext } from "../domain/agent-context";
import { result, type ApplicationResult } from "./application-result";
import type { CodexDependencies } from "./codex-ports";

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{6,200}$/;

async function resolve(dependencies: CodexDependencies, params: AgentContextParams) {
  const context = await dependencies.contexts.resolve(params);
  if (!context) return result({ error: "Workspace introuvable." }, 404);
  if (!context.agent) return result({ error: "Agent introuvable." }, 404);
  if (!canConfigureAgentRuntime(context)) return result({ error: "Seul un Owner peut connecter l’abonnement Codex." }, 403);
  return context;
}

function isResult(value: AgentRuntimeContext | ApplicationResult): value is ApplicationResult {
  return "status" in value;
}

function failure(dependencies: CodexDependencies, error: unknown) {
  const mapped = dependencies.runtime.classifyError(error);
  return mapped.notFound ? result({ ok: true }) : result({ error: mapped.message }, mapped.status);
}

export function createCodexUseCases(dependencies: CodexDependencies) {
  return {
    async start(params: AgentContextParams) {
      const context = await resolve(dependencies, params);
      if (isResult(context)) return context;
      try {
        return result(await dependencies.runtime.start(context.agent!.id, context.agent!.hermesProfileName));
      } catch (error) {
        return failure(dependencies, error);
      }
    },
    async poll(params: AgentContextParams, sessionId: string | null) {
      const context = await resolve(dependencies, params);
      if (isResult(context)) return context;
      if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) return result({ error: "Session de connexion invalide." }, 400);
      try {
        const status = await dependencies.runtime.poll(context.agent!.id, context.agent!.hermesProfileName, sessionId);
        if (status.status === "approved") {
          await dependencies.mutations.recordConnected({
            sessionId, userId: context.userId, agentId: context.agent!.id,
            tenantId: context.tenantId, workspaceId: context.workspaceId,
          });
        }
        return result(status);
      } catch (error) {
        return failure(dependencies, error);
      }
    },
    async disconnect(params: AgentContextParams, sessionId: string | null, sessionIdWasRequested: boolean) {
      const context = await resolve(dependencies, params);
      if (isResult(context)) return context;
      if (sessionIdWasRequested && (!sessionId || !SESSION_ID_PATTERN.test(sessionId))) {
        return result({ error: "Session de connexion invalide." }, 400);
      }
      try {
        if (sessionIdWasRequested) {
          const cancelled = await dependencies.runtime.cancel(context.agent!.id, context.agent!.hermesProfileName, sessionId!);
          return result({ ok: cancelled.ok !== false });
        }
        const usesCodex = await dependencies.runtime.usesCodex(context.agent!.id, context.agent!.hermesProfileName);
        const disconnected = await dependencies.runtime.disconnect(context.agent!.id, context.agent!.hermesProfileName);
        if (usesCodex) await dependencies.mutations.markSetupRequired(context.agent!.id);
        if (disconnected.ok !== false) {
          await dependencies.mutations.recordDisconnected({
            userId: context.userId, agentId: context.agent!.id,
            tenantId: context.tenantId, workspaceId: context.workspaceId,
          });
        }
        return result({ ok: true });
      } catch (error) {
        return failure(dependencies, error);
      }
    },
  };
}
