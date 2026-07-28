import type { AgentContextPort } from "../domain/agent-context";

export type HermesEnvRow = {
  is_set?: boolean;
  is_password?: boolean;
  provider?: string;
  provider_label?: string;
  description?: string;
  url?: string | null;
};

export type HermesModelProvider = {
  slug?: string;
  name?: string;
  models?: unknown[];
  authenticated?: boolean;
  capabilities?: Record<string, { fast?: boolean; reasoning?: boolean }>;
  warning?: string;
  source?: string;
};

export type RuntimeState = {
  env: Record<string, HermesEnvRow>;
  info: { provider?: string; model?: string };
  options: { providers?: HermesModelProvider[] };
  oauth: {
    providers?: Array<{
      id?: string;
      name?: string;
      flow?: "pkce" | "device_code" | "external";
      docs_url?: string;
      status?: { logged_in?: boolean };
    }>;
  };
  config: { agent?: { reasoning_effort?: unknown } };
};

export interface InferenceRuntimePort {
  load(agentId: string, profile: string, refresh?: boolean): Promise<RuntimeState>;
  updateReasoning(agentId: string, profile: string, reasoningEffort: string): Promise<void>;
  validateCredential(agentId: string, profile: string, key: string, value: string): Promise<{
    ok?: boolean;
    reachable?: boolean;
    message?: string;
  }>;
  setCredential(agentId: string, profile: string, key: string, value: string): Promise<void>;
  deleteCredential(agentId: string, profile: string, key: string): Promise<void>;
  setModel(input: {
    agentId: string;
    profile: string;
    provider: string;
    model: string;
    confirmExpensiveModel: boolean;
  }): Promise<{ ok?: boolean; confirm_required?: boolean; confirm_message?: string }>;
  classifyError(error: unknown): { message: string; status: number; notFound: boolean };
}

export interface AgentInferenceMutationPort {
  markReady(agentId: string): Promise<void>;
  markSetupRequired(agentId: string, reason: string): Promise<void>;
  audit(input: {
    tenantId: string;
    workspaceId: string;
    userId: string;
    agentId: string;
    action: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

export type InferenceDependencies = {
  contexts: AgentContextPort;
  runtime: InferenceRuntimePort;
  mutations: AgentInferenceMutationPort;
};
