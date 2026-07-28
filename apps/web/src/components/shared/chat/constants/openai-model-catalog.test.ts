import { describe, expect, test } from "bun:test";
import {
  formatModelPrice,
  getOpenAiModelMeta,
  missingOpenAiCatalogModels,
  sortOpenAiModels,
} from "@/components/shared/chat/constants/openai-model-catalog";
import { credentialFieldCopy } from "@/components/shared/chat/constants/openai-credential";
import {
  formatEffortPreferenceLabel,
  getReasoningControlConfig,
} from "@/components/shared/chat/constants/reasoning-config";

describe("openai model catalog", () => {
  test("includes gpt-5.6 family metadata", () => {
    const meta = getOpenAiModelMeta("gpt-5.6-luna");
    expect(meta?.tier).toBe("value");
    expect(meta?.inputPerMTok).toBe(1);
    expect(formatModelPrice(meta!)).toContain("$1");
  });
});

describe("openai credential copy", () => {
  test("uses OpenAI-specific labels", () => {
    const copy = credentialFieldCopy("openai-api", false);
    expect(copy.label).toBe("Clé API OpenAI");
    expect(copy.placeholder).toContain("sk-");
    expect(copy.docsUrl).toContain("openai.com");
  });
});

describe("reasoning preference label", () => {
  test("formats effort as preference label", () => {
    expect(formatEffortPreferenceLabel("openai-api", "gpt-5.5", "low")).toBe(
      "Effort · Bas",
    );
  });

  test("supports gpt-5.6 reasoning models", () => {
    expect(getReasoningControlConfig("openai-api", "gpt-5.6-sol")?.defaultId).toBe(
      "medium",
    );
  });

  test("sorts and detects missing catalog models", () => {
    const models = ["gpt-4o", "gpt-5.5", "gpt-5.4-mini"];
    expect(sortOpenAiModels(models)).toEqual(["gpt-5.5", "gpt-5.4-mini", "gpt-4o"]);
    expect(missingOpenAiCatalogModels(models)).toEqual([
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
    ]);
    expect(missingOpenAiCatalogModels(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"])).toEqual([]);
  });
});
