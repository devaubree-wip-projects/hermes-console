import { afterEach, describe, expect, test } from "bun:test";
import { __resetRateLimitStore, clientIp, rateLimit } from "./rate-limit";

afterEach(() => __resetRateLimitStore());

describe("rateLimit", () => {
  const opts = { limit: 3, windowMs: 60_000 };

  test("allows up to the limit within a window", () => {
    expect(rateLimit("k", opts, 1_000).ok).toBe(true);
    expect(rateLimit("k", opts, 1_000).ok).toBe(true);
    expect(rateLimit("k", opts, 1_000).ok).toBe(true);
  });

  test("blocks past the limit and reports retry-after", () => {
    for (let i = 0; i < 3; i += 1) rateLimit("k", opts, 1_000);
    const blocked = rateLimit("k", opts, 1_000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSeconds).toBe(60);
  });

  test("resets after the window elapses", () => {
    for (let i = 0; i < 3; i += 1) rateLimit("k", opts, 1_000);
    expect(rateLimit("k", opts, 1_000).ok).toBe(false);
    expect(rateLimit("k", opts, 61_001).ok).toBe(true);
  });

  test("isolates distinct keys", () => {
    for (let i = 0; i < 3; i += 1) rateLimit("a", opts, 1_000);
    expect(rateLimit("a", opts, 1_000).ok).toBe(false);
    expect(rateLimit("b", opts, 1_000).ok).toBe(true);
  });
});

describe("clientIp", () => {
  test("takes the first hop of X-Forwarded-For", () => {
    const request = new Request("http://x", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    expect(clientIp(request)).toBe("203.0.113.7");
  });

  test("falls back to X-Real-IP then to a constant", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "198.51.100.4" } }))).toBe(
      "198.51.100.4",
    );
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});
