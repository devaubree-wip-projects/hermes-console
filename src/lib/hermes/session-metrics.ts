export const GATEWAY_CONTEXT_FRESHNESS_MS = 2_000;

export type SessionMetricsResponse = {
  sessionId: string;
  source: string | null;
  model: string | null;
  provider: string | null;
  reasoningEffort: string | null;
  usage: {
    processedTokens: number;
    inputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    apiCalls: number;
  };
  context: {
    usedTokens: number;
    maxTokens: number;
    remainingTokens: number;
    percent: number;
    measuredAt: string;
  } | null;
};

export type HermesSessionMetricsRow = {
  id?: string;
  session_id?: string;
  source?: string | null;
  model?: string | null;
  model_config?: string | Record<string, unknown> | null;
  billing_provider?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_tokens?: number | null;
  cache_write_tokens?: number | null;
  reasoning_tokens?: number | null;
  api_call_count?: number | null;
};

export type HermesGatewaySessionSnapshot = {
  session_id?: unknown;
  updated_at?: unknown;
  last_prompt_tokens?: unknown;
};

export type HermesModelContextInfo = {
  model?: string | null;
  provider?: string | null;
  effective_context_length?: number | null;
};

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function timestampMs(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1_000 : value;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric < 10_000_000_000 ? numeric * 1_000 : numeric;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function modelConfig(value: HermesSessionMetricsRow["model_config"]) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function nestedRecord(value: unknown) {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

export function processedTokenCount(row: HermesSessionMetricsRow) {
  return count(row.input_tokens)
    + count(row.cache_read_tokens)
    + count(row.cache_write_tokens)
    + count(row.output_tokens);
}

export function buildSessionMetrics({
  row,
  recentLastActive,
  gateway,
  modelInfo,
}: {
  row: HermesSessionMetricsRow;
  recentLastActive?: number | string | null;
  gateway?: HermesGatewaySessionSnapshot | null;
  modelInfo?: HermesModelContextInfo | null;
}): SessionMetricsResponse {
  const sessionId = String(row.id ?? row.session_id ?? "");
  const config = modelConfig(row.model_config);
  const reasoning = nestedRecord(config.reasoning_config);
  const gatewayRuntime = nestedRecord(config.gateway_runtime);
  const model = typeof row.model === "string" && row.model ? row.model : null;
  const provider = typeof row.billing_provider === "string" && row.billing_provider
    ? row.billing_provider
    : typeof gatewayRuntime.provider === "string" && gatewayRuntime.provider
      ? gatewayRuntime.provider
      : null;
  const reasoningEffort = reasoning.enabled === false
    ? "none"
    : typeof reasoning.effort === "string" && reasoning.effort
      ? reasoning.effort
      : null;

  const inputTokens = count(row.input_tokens);
  const cacheReadTokens = count(row.cache_read_tokens);
  const cacheWriteTokens = count(row.cache_write_tokens);
  const outputTokens = count(row.output_tokens);
  const reasoningTokens = count(row.reasoning_tokens);
  const apiCalls = count(row.api_call_count);

  const measuredAtMs = timestampMs(gateway?.updated_at);
  const lastActiveMs = timestampMs(recentLastActive);
  const usedTokens = count(gateway?.last_prompt_tokens);
  const maxTokens = count(modelInfo?.effective_context_length);
  const sameSession = gateway?.session_id === sessionId;
  const sameModel = Boolean(model && modelInfo?.model === model);
  const sameProvider = !provider || !modelInfo?.provider || modelInfo.provider === provider;
  const fresh = measuredAtMs !== null
    && lastActiveMs !== null
    && Math.abs(measuredAtMs - lastActiveMs) <= GATEWAY_CONTEXT_FRESHNESS_MS;
  const hasExactContext = sameSession
    && sameModel
    && sameProvider
    && fresh
    && usedTokens > 0
    && maxTokens > 0;

  return {
    sessionId,
    source: typeof row.source === "string" && row.source ? row.source : null,
    model,
    provider,
    reasoningEffort,
    usage: {
      processedTokens: inputTokens + cacheReadTokens + cacheWriteTokens + outputTokens,
      inputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      outputTokens,
      reasoningTokens,
      apiCalls,
    },
    context: hasExactContext
      ? {
          usedTokens,
          maxTokens,
          remainingTokens: Math.max(0, maxTokens - usedTokens),
          percent: Math.max(0, Math.min(100, usedTokens / maxTokens * 100)),
          measuredAt: new Date(measuredAtMs).toISOString(),
        }
      : null,
  };
}
