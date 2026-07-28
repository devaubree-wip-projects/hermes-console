import { createInferenceUseCases } from "../application/inference-use-cases";
import { agentContextRepository } from "./agent-context-repository";
import { drizzleAgentInferenceMutations } from "./drizzle-agent-inference-mutations";
import { hermesInferenceRuntime } from "./hermes-inference-runtime";

export const inferenceService = createInferenceUseCases({
  contexts: agentContextRepository,
  runtime: hermesInferenceRuntime,
  mutations: drizzleAgentInferenceMutations,
});
