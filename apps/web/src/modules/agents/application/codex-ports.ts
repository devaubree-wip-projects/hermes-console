import type { AgentContextPort } from "../domain/agent-context";

export interface CodexRuntimePort {
  start(agentId: string, profile: string): Promise<unknown>;
  poll(agentId: string, profile: string, sessionId: string): Promise<{ status: string; [key: string]: unknown }>;
  cancel(agentId: string, profile: string, sessionId: string): Promise<{ ok?: boolean }>;
  disconnect(agentId: string, profile: string): Promise<{ ok?: boolean }>;
  usesCodex(agentId: string, profile: string): Promise<boolean>;
  classifyError(error: unknown): { message: string; status: number; notFound: boolean };
}

export interface CodexMutationPort {
  recordConnected(input: { sessionId: string; userId: string; agentId: string; tenantId: string; workspaceId: string }): Promise<void>;
  recordDisconnected(input: { userId: string; agentId: string; tenantId: string; workspaceId: string }): Promise<void>;
  markSetupRequired(agentId: string): Promise<void>;
}

export type CodexDependencies = { contexts: AgentContextPort; runtime: CodexRuntimePort; mutations: CodexMutationPort };
