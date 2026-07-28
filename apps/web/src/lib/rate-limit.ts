// In-process fixed-window rate limiter for abuse-sensitive routes (login,
// registration, password reset). State lives in this instance's memory: it is
// effective for the single-instance production compose. A multi-instance
// deployment would need a shared store (Redis/Postgres) — tracked as follow-up.

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

// E2E drives dozens of logins from one IP; the limiter would flake the suite.
// Only the e2e dev server sets this — never production.
const DISABLED = process.env.HERMES_DISABLE_RATE_LIMIT === "1";

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

function sweep(now: number) {
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number },
  now: number = Date.now(),
): RateLimitResult {
  if (DISABLED) return { ok: true };
  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    if (store.size >= MAX_KEYS) sweep(now);
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return { ok: true };
  }
  if (existing.count >= options.limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }
  existing.count += 1;
  return { ok: true };
}

/** Best-effort client IP behind a reverse proxy (Caddy sets X-Forwarded-For). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** 429 response with a Retry-After header, mirroring the app's JSON error shape. */
export function tooManyRequestsResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "Trop de tentatives. Réessayez dans quelques instants." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

/** Test-only: clears all buckets so cases don't leak state into each other. */
export function __resetRateLimitStore() {
  store.clear();
}
