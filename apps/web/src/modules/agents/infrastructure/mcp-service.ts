import { createMcpUseCases } from "../application/mcp-use-cases";
import { agentContextRepository } from "./agent-context-repository";
import { drizzleMessagingAudit } from "./drizzle-messaging-audit";
import { hermesMcpRuntime } from "./hermes-mcp-runtime";

export const mcpService = createMcpUseCases({
  contexts: agentContextRepository,
  runtime: hermesMcpRuntime,
  // L'écriture d'audit est générique (insert dans `auditEvents`) : le nom porte
  // son module d'origine, pas une contrainte de domaine.
  audit: drizzleMessagingAudit,
});
