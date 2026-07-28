import { createCodexUseCases } from "../application/codex-use-cases";
import { agentContextRepository } from "./agent-context-repository";
import { drizzleCodexMutations } from "./drizzle-codex-mutations";
import { hermesCodexRuntime } from "./hermes-codex-runtime";

export const codexService = createCodexUseCases({
  contexts: agentContextRepository,
  runtime: hermesCodexRuntime,
  mutations: drizzleCodexMutations,
});
