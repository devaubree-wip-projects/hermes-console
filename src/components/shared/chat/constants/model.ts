export const LLM_PROVIDERS = ["openai", "claude", "ollama", "gemini"] as const;

export type LLMProvider = (typeof LLM_PROVIDERS)[number];

export const LLM_PROVIDER_LABELS: Record<LLMProvider, string> = {
  claude: "Claude",
  openai: "OpenAI",
  ollama: "Ollama",
  gemini: "Gemini",
};

export const DEFAULT_LLM_PROVIDER: LLMProvider = "openai";

export const PROVIDER_MODEL_IDS = {
  openai: ["gpt-5.5", "gpt-5.4-mini", "gpt-5.4-nano"],
  claude: [
    "claude-opus-4-8",
    "claude-opus-4-8-fast",
    "claude-opus-4-7",
    "claude-opus-4-7-fast",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
  ],
  ollama: ["llama3.2", "qwen2.5-coder", "mistral"],
  gemini: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
} as const satisfies Record<LLMProvider, readonly string[]>;

export const DEFAULT_MODEL_BY_PROVIDER = {
  openai: PROVIDER_MODEL_IDS.openai[0],
  claude: PROVIDER_MODEL_IDS.claude[0],
  ollama: PROVIDER_MODEL_IDS.ollama[0],
  gemini: PROVIDER_MODEL_IDS.gemini[0],
} as const satisfies Record<LLMProvider, string>;

export const DEFAULT_MODEL_ID = DEFAULT_MODEL_BY_PROVIDER.openai;

export const MODEL_IDS = [
  ...PROVIDER_MODEL_IDS.openai,
  ...PROVIDER_MODEL_IDS.claude,
  ...PROVIDER_MODEL_IDS.ollama,
  ...PROVIDER_MODEL_IDS.gemini,
] as const;

export type ModelId = (typeof MODEL_IDS)[number];

export const REASONING_EFFORT_IDS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "off",
  "auto",
] as const;

export type ReasoningEffortId = (typeof REASONING_EFFORT_IDS)[number];

export function getDefaultModelId(provider: LLMProvider) {
  return DEFAULT_MODEL_BY_PROVIDER[provider];
}
