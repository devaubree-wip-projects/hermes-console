export type AgentRuntimeContext = {
  userId: string;
  tenantId: string;
  workspaceId: string;
  role: "owner" | "member" | "viewer";
  agent: {
    id: string;
    name: string;
    slug: string;
    hermesProfileName: string;
  } | null;
};

export type AgentContextParams = {
  tenantSlug: string;
  workspaceSlug: string;
  agentSlug: string;
};

export interface AgentContextPort {
  resolve(params: AgentContextParams): Promise<AgentRuntimeContext | null>;
}

export function canConfigureAgentRuntime(context: AgentRuntimeContext) {
  return context.role === "owner";
}
