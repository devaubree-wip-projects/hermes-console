"use client"

import {
  LLM_PROVIDERS,
  MODEL_IDS,
  type LLMProvider,
  type ModelId,
} from "@/components/shared/chat/constants/model"

const COOKIE_NAME = "v1-xulux-llm"
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export type LlmPreference = {
  provider: LLMProvider
  modelName: ModelId
}

function isLlmPreference(value: unknown): value is LlmPreference {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.provider === "string" &&
    LLM_PROVIDERS.includes(candidate.provider as LLMProvider) &&
    typeof candidate.modelName === "string" &&
    MODEL_IDS.includes(candidate.modelName as ModelId)
  )
}

/** Reads the persisted LLM choice from the cookie. Returns null when unset or invalid. */
export function readLlmPreference(): LlmPreference | null {
  if (typeof document === "undefined") return null
  const entry = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
  if (!entry) return null
  try {
    const parsed = JSON.parse(
      decodeURIComponent(entry.slice(COOKIE_NAME.length + 1)),
    )
    return isLlmPreference(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Persists the LLM choice in a cookie so it is restored on the next /d/chat visit. */
export function writeLlmPreference(preference: LlmPreference): void {
  if (typeof document === "undefined") return
  const value = encodeURIComponent(JSON.stringify(preference))
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`
}
