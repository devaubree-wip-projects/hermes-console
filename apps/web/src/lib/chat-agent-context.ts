export type AgentIdInput = {
  agentId?: string | null;
  agentSlug?: string | null;
};

function normalize(input: string | null | undefined): string | null {
  const value = typeof input === "string" ? input.trim() : "";
  return value.length > 0 ? value : null;
}

export function resolveActiveAgentQuery(
  input: { agentId?: string | null; agent?: string | null },
): AgentIdInput {
  const normalized = normalize((input as { agentId?: string | null })?.agentId);
  const legacy = normalize((input as { agent?: string | null })?.agent);
  return {
    agentId: normalized,
    agentSlug: !normalized ? legacy : null,
  };
}

export function appendAgentQuery(baseUrl: string, activeAgentId?: string | null): string {
  if (!activeAgentId) return baseUrl;
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}agentId=${encodeURIComponent(activeAgentId)}`;
}
