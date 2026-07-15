import { describe, expect, test } from "bun:test";
import { capacityRecommendation, capacitySample, evaluateInferenceBudget } from "./runtime-policy";

describe("runtime budget and capacity policy", () => {
  test("enforces a hard inference cap while preserving explicit Owner approval", () => {
    const budget = {
      inferenceLimitMicros: 10_000_000, infrastructureLimitMicros: null, globalLimitMicros: null,
      alertThresholdPercent: 80, hardCapAction: "owner_approval", softCapAction: "alert",
    } as never;
    const usage = { inferenceCostMicros: 10_000_000, infrastructureCostMicros: 0 } as never;
    expect(evaluateInferenceBudget(budget, usage, "member").allowed).toBeFalse();
    expect(evaluateInferenceBudget(budget, usage, "owner").allowed).toBeTrue();
  });

  test("labels soft-cap warnings without pretending unknown costs are exact", () => {
    const budget = {
      inferenceLimitMicros: 10_000_000, infrastructureLimitMicros: null, globalLimitMicros: null,
      alertThresholdPercent: 80, hardCapAction: "pause", softCapAction: "alert",
    } as never;
    const decision = evaluateInferenceBudget(budget, { inferenceCostMicros: 8_500_000, infrastructureCostMicros: null } as never, "member");
    expect(decision.allowed).toBeTrue();
    expect(decision.reason).toBe("soft_cap");
  });

  test("permits a hard cap only when an explicit fallback model can be forced", () => {
    const usage = { inferenceCostMicros: 20, infrastructureCostMicros: 0, costCurrency: "USD" } as never;
    const base = { inferenceLimitMicros: 10, infrastructureLimitMicros: null, globalLimitMicros: null, currency: "USD", alertThresholdPercent: 80, hardCapAction: "fallback_model", softCapAction: "alert" };
    expect(evaluateInferenceBudget({ ...base, fallbackModel: null } as never, usage, "member").allowed).toBeFalse();
    expect(evaluateInferenceBudget({ ...base, fallbackModel: "cheap/model" } as never, usage, "member").allowed).toBeTrue();
  });

  test("normalizes capacity and recommends resize only when configured headroom is crossed", () => {
    const sample = capacitySample({ cpu_percent: 84, memory: { used: 80, total: 100 }, disk: { used: 40, total: 100 } }, 3);
    expect(sample.cpuPercentBasisPoints).toBe(8400);
    expect(capacityRecommendation(sample, 20).saturated).toBeTrue();
    expect(capacityRecommendation(capacitySample({ cpu_percent: 20 }, 1), 20).saturated).toBeFalse();
  });
});
