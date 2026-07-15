/**
 * Reasoning controls exposed by the Hermes runtime.
 *
 * The provider slug and model id are runtime values, not the small static
 * documentation catalog used by the example model selector. Keep this policy
 * explicit: an unknown provider/model hides the control instead of exposing a
 * generic effort list that may be rejected or silently ignored upstream.
 */

export const ALL_REASONING_CONTROL_IDS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ReasoningControlId = (typeof ALL_REASONING_CONTROL_IDS)[number];

export type ReasoningControlOption = {
  id: ReasoningControlId;
  name: string;
  description?: string;
};

export type ReasoningControlConfig = {
  label: string;
  options: readonly ReasoningControlOption[];
  defaultId: ReasoningControlId;
};

const EFFORT_LOW: ReasoningControlOption = {
  id: "low",
  name: "Low",
  description: "Fast responses with lighter reasoning",
};

const EFFORT_MEDIUM: ReasoningControlOption = {
  id: "medium",
  name: "Medium",
  description: "Balanced speed, cost, and depth",
};

const EFFORT_HIGH: ReasoningControlOption = {
  id: "high",
  name: "High",
  description: "Deeper reasoning for complex work",
};

const EFFORT_XHIGH: ReasoningControlOption = {
  id: "xhigh",
  name: "Extra high",
  description: "Long-horizon coding and agentic work",
};

const EFFORT_MAX: ReasoningControlOption = {
  id: "max",
  name: "Max",
  description: "Maximum reasoning supported by this model",
};

const openAiReasoning: ReasoningControlConfig = {
  label: "Reasoning",
  defaultId: "medium",
  options: [EFFORT_LOW, EFFORT_MEDIUM, EFFORT_HIGH, EFFORT_XHIGH],
};

const claudeModernReasoning: ReasoningControlConfig = {
  label: "Effort",
  defaultId: "high",
  options: [
    EFFORT_LOW,
    EFFORT_MEDIUM,
    EFFORT_HIGH,
    EFFORT_XHIGH,
    EFFORT_MAX,
  ],
};

const claude46Reasoning: ReasoningControlConfig = {
  label: "Effort",
  defaultId: "high",
  options: [EFFORT_LOW, EFFORT_MEDIUM, EFFORT_HIGH, EFFORT_MAX],
};

const claudeSonnet46Reasoning: ReasoningControlConfig = {
  ...claude46Reasoning,
  defaultId: "medium",
};

const claudeLegacyReasoning: ReasoningControlConfig = {
  label: "Effort",
  defaultId: "medium",
  options: [EFFORT_LOW, EFFORT_MEDIUM, EFFORT_HIGH, EFFORT_XHIGH],
};

const OPENAI_PROVIDER_SLUGS = new Set([
  "openai",
  "openai-api",
  "openai-codex",
]);

const ANTHROPIC_PROVIDER_SLUGS = new Set(["anthropic", "claude"]);

const OPENAI_REASONING_MODEL = /^(?:gpt-5|codex|o[134](?:-|$))/;
const CLAUDE_46_MODEL = /claude-(?:opus|sonnet)-4[-.]6/;
const CLAUDE_MODERN_MODEL = /(?:claude-fable|claude-(?:opus|sonnet)-4[-.](?:[789]|\d{2,}))/;
const CLAUDE_LEGACY_MODEL = /claude-(?:opus|sonnet|haiku)-(?:3|4[-.](?:0|1|5)|4-2025)/;

export function isReasoningControlId(value: string): value is ReasoningControlId {
  return ALL_REASONING_CONTROL_IDS.includes(value as ReasoningControlId);
}

export function getReasoningControlConfig(
  provider: string,
  modelId: string,
  supportsReasoning = true,
): ReasoningControlConfig | null {
  if (!supportsReasoning) return null;

  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedModel = modelId.trim().toLowerCase();
  if (!normalizedProvider || !normalizedModel) return null;

  if (OPENAI_PROVIDER_SLUGS.has(normalizedProvider)) {
    return OPENAI_REASONING_MODEL.test(normalizedModel)
      ? openAiReasoning
      : null;
  }

  if (!ANTHROPIC_PROVIDER_SLUGS.has(normalizedProvider)) return null;
  if (CLAUDE_46_MODEL.test(normalizedModel)) {
    return normalizedModel.includes("sonnet")
      ? claudeSonnet46Reasoning
      : claude46Reasoning;
  }
  if (CLAUDE_MODERN_MODEL.test(normalizedModel)) return claudeModernReasoning;
  if (CLAUDE_LEGACY_MODEL.test(normalizedModel)) return claudeLegacyReasoning;
  return null;
}

export function getDefaultReasoningControlId(
  provider: string,
  modelId: string,
  supportsReasoning = true,
): ReasoningControlId | undefined {
  return getReasoningControlConfig(provider, modelId, supportsReasoning)?.defaultId;
}

export function normalizeReasoningControlId(
  provider: string,
  modelId: string,
  value: string | undefined,
  supportsReasoning = true,
): ReasoningControlId | undefined {
  const config = getReasoningControlConfig(
    provider,
    modelId,
    supportsReasoning,
  );
  if (!config) return undefined;
  if (
    value
    && isReasoningControlId(value)
    && config.options.some((option) => option.id === value)
  ) {
    return value;
  }
  return config.defaultId;
}
