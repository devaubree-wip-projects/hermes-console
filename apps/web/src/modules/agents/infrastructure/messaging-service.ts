import { createMessagingUseCases } from "../application/messaging-use-cases";
import { agentContextRepository } from "./agent-context-repository";
import { drizzleMessagingAudit } from "./drizzle-messaging-audit";
import { hermesMessagingRuntime } from "./hermes-messaging-runtime";

export const messagingService = createMessagingUseCases({
  contexts: agentContextRepository,
  runtime: hermesMessagingRuntime,
  audit: drizzleMessagingAudit,
});
