/**
 * OpenAI model metadata overlay for Hermes Console.
 * Hermes exposes model ids only; pricing/tiers are maintained here.
 * Verify against https://platform.openai.com/docs/pricing
 */

export type OpenAiModelTier = "flagship" | "standard" | "value" | "legacy";

export type OpenAiModelMeta = {
  id: string;
  label?: string;
  tier: OpenAiModelTier;
  inputPerMTok: number;
  outputPerMTok: number;
  cachedInputPerMTok?: number;
  context?: number;
  reasoning: boolean;
};

export const OPENAI_MODEL_CATALOG: readonly OpenAiModelMeta[] = [
  {
    id: "gpt-5.6-sol",
    tier: "flagship",
    inputPerMTok: 5,
    outputPerMTok: 30,
    cachedInputPerMTok: 0.5,
    context: 1_000_000,
    reasoning: true,
  },
  {
    id: "gpt-5.6-terra",
    tier: "standard",
    inputPerMTok: 2.5,
    outputPerMTok: 15,
    cachedInputPerMTok: 0.25,
    context: 1_000_000,
    reasoning: true,
  },
  {
    id: "gpt-5.6-luna",
    tier: "value",
    inputPerMTok: 1,
    outputPerMTok: 6,
    cachedInputPerMTok: 0.1,
    context: 1_000_000,
    reasoning: true,
  },
  {
    id: "gpt-5.5",
    tier: "flagship",
    inputPerMTok: 5,
    outputPerMTok: 30,
    cachedInputPerMTok: 0.5,
    context: 1_000_000,
    reasoning: true,
  },
  {
    id: "gpt-5.5-pro",
    tier: "flagship",
    inputPerMTok: 30,
    outputPerMTok: 180,
    context: 1_000_000,
    reasoning: true,
  },
  {
    id: "gpt-5.4",
    tier: "standard",
    inputPerMTok: 2.5,
    outputPerMTok: 15,
    cachedInputPerMTok: 0.25,
    context: 1_000_000,
    reasoning: true,
  },
  {
    id: "gpt-5.4-pro",
    tier: "flagship",
    inputPerMTok: 30,
    outputPerMTok: 180,
    context: 1_000_000,
    reasoning: true,
  },
  {
    id: "gpt-5.4-mini",
    tier: "value",
    inputPerMTok: 0.75,
    outputPerMTok: 4.5,
    cachedInputPerMTok: 0.075,
    context: 400_000,
    reasoning: true,
  },
  {
    id: "gpt-5.4-nano",
    tier: "value",
    inputPerMTok: 0.2,
    outputPerMTok: 1.25,
    cachedInputPerMTok: 0.02,
    reasoning: true,
  },
  {
    id: "gpt-5-mini",
    tier: "value",
    inputPerMTok: 0.75,
    outputPerMTok: 4.5,
    reasoning: true,
  },
  {
    id: "gpt-5.3-codex",
    tier: "standard",
    inputPerMTok: 1.75,
    outputPerMTok: 14,
    context: 1_000_000,
    reasoning: true,
  },
  {
    id: "gpt-4.1",
    tier: "legacy",
    inputPerMTok: 2,
    outputPerMTok: 8,
    context: 1_000_000,
    reasoning: false,
  },
  {
    id: "gpt-4o",
    tier: "legacy",
    inputPerMTok: 2.5,
    outputPerMTok: 10,
    reasoning: false,
  },
  {
    id: "gpt-4o-mini",
    tier: "legacy",
    inputPerMTok: 0.15,
    outputPerMTok: 0.6,
    reasoning: false,
  },
] as const;

const catalogById = new Map(
  OPENAI_MODEL_CATALOG.map((entry) => [entry.id.toLowerCase(), entry]),
);

export const OPENAI_TIER_LABELS: Record<OpenAiModelTier, string> = {
  flagship: "Premium",
  standard: "Standard",
  value: "Économique",
  legacy: "Legacy",
};

export function getOpenAiModelMeta(modelId: string): OpenAiModelMeta | undefined {
  const bare = modelId.includes("/") ? modelId.split("/").at(-1) ?? modelId : modelId;
  return catalogById.get(bare.trim().toLowerCase());
}

export function formatModelPrice(meta: OpenAiModelMeta) {
  const format = (value: number) =>
    value < 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
  return `${format(meta.inputPerMTok)} / ${format(meta.outputPerMTok)} / 1M`;
}

export function displayModelId(modelId: string | null | undefined) {
  if (!modelId) return "";
  return modelId.includes("/") ? modelId.split("/").at(-1) ?? modelId : modelId;
}

const CATALOG_ORDER = new Map(
  OPENAI_MODEL_CATALOG.map((entry, index) => [entry.id.toLowerCase(), index]),
);

export function sortOpenAiModels(models: readonly string[]) {
  return [...models].sort((left, right) => {
    const leftIndex = CATALOG_ORDER.get(left.toLowerCase()) ?? Number.POSITIVE_INFINITY;
    const rightIndex = CATALOG_ORDER.get(right.toLowerCase()) ?? Number.POSITIVE_INFINITY;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.localeCompare(right);
  });
}

export function missingOpenAiCatalogModels(models: readonly string[]) {
  const available = new Set(models.map((model) => model.toLowerCase()));
  return OPENAI_MODEL_CATALOG
    .filter((entry) => entry.id.startsWith("gpt-5.6") && !available.has(entry.id.toLowerCase()))
    .map((entry) => entry.id);
}

export function isOpenAiApiProvider(providerId: string) {
  return providerId.trim().toLowerCase() === "openai-api";
}
