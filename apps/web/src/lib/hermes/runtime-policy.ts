import type { runtimeBudgets, runtimeUsageSamples } from "@/db/schema";

type Budget = typeof runtimeBudgets.$inferSelect;
type Usage = typeof runtimeUsageSamples.$inferSelect;

export type BudgetDecision = {
  allowed: boolean;
  warning: boolean;
  reason: "inference_hard_cap" | "global_hard_cap" | "soft_cap" | "currency_mismatch" | null;
  action: string | null;
  spentMicros: number;
  limitMicros: number | null;
};

export function evaluateInferenceBudget(budget: Budget | null, usage: Usage | null, role: string): BudgetDecision {
  const inference = usage?.inferenceCostMicros ?? 0;
  const infrastructure = usage?.infrastructureCostMicros ?? 0;
  const global = inference + infrastructure;
  if (!budget) return { allowed: true, warning: false, reason: null, action: null, spentMicros: inference, limitMicros: null };
  if (usage?.costCurrency && usage.costCurrency !== budget.currency) {
    return { allowed: true, warning: true, reason: "currency_mismatch", action: "configure_matching_currency", spentMicros: inference, limitMicros: budget.inferenceLimitMicros };
  }
  const hard = budget.inferenceLimitMicros !== null && inference >= budget.inferenceLimitMicros
    ? { reason: "inference_hard_cap" as const, spent: inference, limit: budget.inferenceLimitMicros }
    : budget.globalLimitMicros !== null && global >= budget.globalLimitMicros
      ? { reason: "global_hard_cap" as const, spent: global, limit: budget.globalLimitMicros }
      : null;
  if (hard) {
    const allowed = (budget.hardCapAction === "owner_approval" && role === "owner")
      || (budget.hardCapAction === "fallback_model" && Boolean(budget.fallbackModel));
    return { allowed, warning: true, reason: hard.reason, action: budget.hardCapAction, spentMicros: hard.spent, limitMicros: hard.limit };
  }
  const ratio = Math.max(
    budget.inferenceLimitMicros ? inference / budget.inferenceLimitMicros : 0,
    budget.globalLimitMicros ? global / budget.globalLimitMicros : 0,
  );
  return {
    allowed: true,
    warning: ratio * 100 >= budget.alertThresholdPercent,
    reason: ratio * 100 >= budget.alertThresholdPercent ? "soft_cap" : null,
    action: ratio * 100 >= budget.alertThresholdPercent ? budget.softCapAction : null,
    spentMicros: inference,
    limitMicros: budget.inferenceLimitMicros,
  };
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function nested(source: Record<string, unknown>, group: string, key: string) {
  const value = source[group];
  return value && typeof value === "object" ? numberValue((value as Record<string, unknown>)[key]) : null;
}

export function capacitySample(system: Record<string, unknown>, profileCount: number) {
  const cpuPercent = numberValue(system.cpu_percent);
  return {
    cpuPercentBasisPoints: cpuPercent === null ? null : Math.min(10_000, Math.round(cpuPercent * 100)),
    memoryUsedBytes: nested(system, "memory", "used"),
    memoryTotalBytes: nested(system, "memory", "total"),
    diskUsedBytes: nested(system, "disk", "used"),
    diskTotalBytes: nested(system, "disk", "total"),
    profileCount,
    activeSessionCount: numberValue(system.active_sessions),
    heavyLoads: {
      browser: nested(system, "heavy_loads", "browser") ?? 0,
      mcp: nested(system, "heavy_loads", "mcp") ?? 0,
      cron: nested(system, "heavy_loads", "cron") ?? 0,
      subagents: nested(system, "heavy_loads", "subagents") ?? 0,
    },
  };
}

export function capacityRecommendation(sample: ReturnType<typeof capacitySample>, headroomPercent = 20) {
  const cpu = sample.cpuPercentBasisPoints === null ? null : sample.cpuPercentBasisPoints / 100;
  const memory = sample.memoryUsedBytes !== null && sample.memoryTotalBytes
    ? sample.memoryUsedBytes / sample.memoryTotalBytes * 100
    : null;
  const disk = sample.diskUsedBytes !== null && sample.diskTotalBytes
    ? sample.diskUsedBytes / sample.diskTotalBytes * 100
    : null;
  const limit = 100 - Math.min(80, Math.max(5, headroomPercent));
  const saturated = [cpu, memory, disk].some((value) => value !== null && value >= limit);
  return {
    saturated,
    headroomPercent,
    recommendation: saturated
      ? "Redimensionnement recommandé avant d’ajouter une charge lourde. Confirmation Owner requise."
      : "Capacité compatible avec le headroom configuré.",
  };
}

export function capacityRecommendationFromUsage(usage: Pick<Usage,
  "cpuPercentBasisPoints" | "memoryUsedBytes" | "memoryTotalBytes" | "diskUsedBytes" | "diskTotalBytes"
>, headroomPercent = 20) {
  return capacityRecommendation({
    cpuPercentBasisPoints: usage.cpuPercentBasisPoints,
    memoryUsedBytes: usage.memoryUsedBytes,
    memoryTotalBytes: usage.memoryTotalBytes,
    diskUsedBytes: usage.diskUsedBytes,
    diskTotalBytes: usage.diskTotalBytes,
    profileCount: 0,
    activeSessionCount: null,
    heavyLoads: { browser: 0, mcp: 0, cron: 0, subagents: 0 },
  }, headroomPercent);
}
