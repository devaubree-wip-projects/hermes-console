export const CODEX_SUBSCRIPTION_PROVIDER = "openai-codex" as const;

export type CodexLoginStart = {
  sessionId: string;
  flow: "device_code";
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  pollInterval: number;
};

export type CodexLoginStatus = {
  status: "pending" | "approved" | "expired" | "error";
  error?: string;
  expiresAt?: number;
};

export type HermesRequester = <T>(path: string, init?: RequestInit) => Promise<T>;

type HermesCodexStart = {
  session_id?: unknown;
  flow?: unknown;
  user_code?: unknown;
  verification_url?: unknown;
  expires_in?: unknown;
  poll_interval?: unknown;
};

type HermesCodexPoll = {
  status?: unknown;
  error_message?: unknown;
  expires_at?: unknown;
};

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Hermes n’a pas retourné ${field} pour la connexion Codex.`);
  }
  return value.trim();
}

function positiveNumber(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function profileQuery(profile: string) {
  return new URLSearchParams({ profile }).toString();
}

/**
 * Server-side adapter for Hermes' native OpenAI Codex subscription flow.
 *
 * Sinew's OAuth implementation is the UX reference, but Hermes remains the
 * credential owner: this adapter deliberately maps only public device-code
 * fields and never returns provider tokens to the caller.
 * Reference: https://github.com/Paseru/sinew/tree/b4a86f67d483af989f5e5a9f21c877519a661e9e
 */
export function createCodexSubscriptionService(request: HermesRequester) {
  return {
    async start(profile: string): Promise<CodexLoginStart> {
      const result = await request<HermesCodexStart>(
        `/api/providers/oauth/${CODEX_SUBSCRIPTION_PROVIDER}/start?${profileQuery(profile)}`,
        {
          method: "POST",
          signal: AbortSignal.timeout(20_000),
        },
      );
      const flow = requiredString(result.flow, "le type de connexion");
      if (flow !== "device_code") {
        throw new Error(`Flux Codex Hermes non pris en charge : ${flow}.`);
      }
      return {
        sessionId: requiredString(result.session_id, "un identifiant de session"),
        flow,
        userCode: requiredString(result.user_code, "un code utilisateur"),
        verificationUrl: requiredString(result.verification_url, "une URL de vérification"),
        expiresIn: positiveNumber(result.expires_in, 15 * 60),
        pollInterval: Math.min(30, Math.max(2, positiveNumber(result.poll_interval, 5))),
      };
    },

    async poll(profile: string, sessionId: string): Promise<CodexLoginStatus> {
      const result = await request<HermesCodexPoll>(
        `/api/providers/oauth/${CODEX_SUBSCRIPTION_PROVIDER}/poll/${encodeURIComponent(sessionId)}?${profileQuery(profile)}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      const rawStatus = requiredString(result.status, "le statut de connexion");
      const status = ["pending", "approved", "expired", "error"].includes(rawStatus)
        ? rawStatus as CodexLoginStatus["status"]
        : "error";
      const error = typeof result.error_message === "string" && result.error_message.trim()
        ? result.error_message.trim()
        : rawStatus === status ? undefined : `Statut Hermes inconnu : ${rawStatus}.`;
      return {
        status,
        ...(error ? { error } : {}),
        ...(typeof result.expires_at === "number" ? { expiresAt: result.expires_at } : {}),
      };
    },

    async cancel(profile: string, sessionId: string) {
      return request<{ ok?: boolean }>(
        `/api/providers/oauth/sessions/${encodeURIComponent(sessionId)}?${profileQuery(profile)}`,
        { method: "DELETE" },
      );
    },

    async disconnect(profile: string) {
      return request<{ ok?: boolean; provider?: string }>(
        `/api/providers/oauth/${CODEX_SUBSCRIPTION_PROVIDER}?${profileQuery(profile)}`,
        { method: "DELETE" },
      );
    },
  };
}
