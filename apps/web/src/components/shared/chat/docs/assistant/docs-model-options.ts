import {
  DEFAULT_LLM_PROVIDER,
  PROVIDER_MODEL_IDS,
  type LLMProvider,
} from "@/components/shared/chat/constants/model";
import type { ModelOption } from "@/components/shared/chat/assistant-ui/model-selector";

/**
 * Context limits follow the provider model catalog maintained below.
 * Provider docs (Jun 2026):
 * - OpenAI: https://developers.openai.com/api/docs/models
 * - Anthropic: https://platform.claude.com/docs/en/about-claude/models/overview
 * - Google: https://ai.google.dev/gemini-api/docs/models
 * - Ollama defaults: model cards + https://github.com/QwenLM/Qwen2.5-Coder
 */
// OpenAI GPT-5.5 / 5.4 headline capacity is 1,050,000 tokens, BUT via a standard
// API call the DEFAULT context window is 272,000 — the full 1.05M is an
// experimental opt-in (model_context_window / model_auto_compact_token_limit) and
// prompts >272K are billed 2x input / 1.5x output (verified Jul 2026, see
// Our backend does not opt in to the expanded context window, so the ring uses the
// real 272K default; raise to 1_050_000 only if the backend enables the 1M mode.
const modelOptionsByProvider = {
  openai: [
    {
      id: PROVIDER_MODEL_IDS.openai[0],
      name: "GPT",
      version: "5.5",
      description: "Latest reasoning model",
      contextWindow: 272_000,
      efforts: true,
    },
    {
      id: PROVIDER_MODEL_IDS.openai[1],
      name: "GPT",
      version: "5.4 mini",
      description: "Fast reasoning model",
      contextWindow: 272_000,
      efforts: true,
    },
    {
      id: PROVIDER_MODEL_IDS.openai[2],
      name: "GPT",
      version: "5.4 nano",
      description: "Lightweight reasoning model",
      contextWindow: 400_000,
      efforts: true,
    },
  ],
  claude: [
    {
      id: PROVIDER_MODEL_IDS.claude[0],
      name: "Opus",
      version: "4.8",
      description: "Highest capability Claude model",
      contextWindow: 1_000_000,
      efforts: true,
    },
    {
      id: PROVIDER_MODEL_IDS.claude[1],
      name: "Opus",
      version: "4.8 Fast",
      description: "Faster Claude Opus variant",
      contextWindow: 1_000_000,
      efforts: true,
    },
    {
      id: PROVIDER_MODEL_IDS.claude[2],
      name: "Opus",
      version: "4.7",
      description: "Previous Claude Opus generation",
      contextWindow: 200_000,
      efforts: true,
    },
    {
      id: PROVIDER_MODEL_IDS.claude[3],
      name: "Opus",
      version: "4.7 Fast",
      description: "Previous fast Claude Opus variant",
      contextWindow: 200_000,
      efforts: true,
    },
    {
      id: PROVIDER_MODEL_IDS.claude[4],
      name: "Opus",
      version: "4.6",
      description: "Claude Opus 4.6",
      contextWindow: 200_000,
      efforts: true,
    },
    {
      id: PROVIDER_MODEL_IDS.claude[5],
      name: "Sonnet",
      version: "4.6",
      description: "Balanced Claude model",
      contextWindow: 1_000_000,
      efforts: true,
    },
    {
      id: PROVIDER_MODEL_IDS.claude[6],
      name: "Haiku",
      version: "4.5",
      description: "Fast Claude model",
      contextWindow: 200_000,
    },
  ],
  ollama: [
    {
      id: PROVIDER_MODEL_IDS.ollama[0],
      name: "Llama",
      version: "3.2",
      description: "Local general model",
      contextWindow: 128_000,
    },
    {
      id: PROVIDER_MODEL_IDS.ollama[1],
      name: "Qwen",
      version: "2.5 Coder",
      description: "Local code model",
      contextWindow: 128_000,
    },
    {
      id: PROVIDER_MODEL_IDS.ollama[2],
      name: "Mistral",
      version: "latest",
      description: "Local lightweight model",
      contextWindow: 32_768,
    },
  ],
  gemini: [
    {
      id: PROVIDER_MODEL_IDS.gemini[0],
      name: "Gemini",
      version: "2.5 Pro",
      description: "Highest capability Gemini model",
      contextWindow: 1_048_576,
      efforts: true,
    },
    {
      id: PROVIDER_MODEL_IDS.gemini[1],
      name: "Gemini",
      version: "2.5 Flash",
      description: "Fast Gemini model",
      contextWindow: 1_048_576,
      efforts: true,
    },
    {
      id: PROVIDER_MODEL_IDS.gemini[2],
      name: "Gemini",
      version: "2.0 Flash",
      description: "Lightweight Gemini model",
      contextWindow: 1_048_576,
      efforts: true,
    },
  ],
} satisfies Record<LLMProvider, readonly ModelOption[]>;

export function docsModelOptions(provider: LLMProvider = DEFAULT_LLM_PROVIDER) {
  return modelOptionsByProvider[provider];
}

const contextWindowByModelId = new Map<string, number>(
  Object.values(modelOptionsByProvider)
    .flat()
    .map((model) => [model.id, model.contextWindow ?? 128_000]),
);

export function getModelContextWindow(modelId: string): number {
  return contextWindowByModelId.get(modelId) ?? 128_000;
}
