import { describe, expect, test } from "bun:test";
import {
  CODEX_SUBSCRIPTION_PROVIDER,
  createCodexSubscriptionService,
  type HermesRequester,
} from "./codex-subscription";

describe("Codex subscription service", () => {
  test("maps only public device-code fields", async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const request: HermesRequester = async (path, init) => {
      calls.push({ path, init });
      return {
        session_id: "oauth_session_123",
        flow: "device_code",
        user_code: "ABCD-EFGH",
        verification_url: "https://auth.openai.com/codex/device",
        expires_in: 900,
        poll_interval: 5,
        access_token: "must-never-leave-hermes",
      } as never;
    };

    const result = await createCodexSubscriptionService(request).start("agent profile");

    expect(result).toEqual({
      sessionId: "oauth_session_123",
      flow: "device_code",
      userCode: "ABCD-EFGH",
      verificationUrl: "https://auth.openai.com/codex/device",
      expiresIn: 900,
      pollInterval: 5,
    });
    expect(result).not.toHaveProperty("access_token");
    expect(calls[0]?.path).toBe(
      `/api/providers/oauth/${CODEX_SUBSCRIPTION_PROVIDER}/start?profile=agent+profile`,
    );
    expect(calls[0]?.init?.method).toBe("POST");
  });

  test("polls, cancels and disconnects within the selected profile", async () => {
    const paths: string[] = [];
    const request: HermesRequester = async (path) => {
      paths.push(path);
      if (path.includes("/poll/")) {
        return { status: "approved", error_message: null, expires_at: 123 } as never;
      }
      return { ok: true } as never;
    };
    const service = createCodexSubscriptionService(request);

    await expect(service.poll("profile-one", "session_safe")).resolves.toEqual({
      status: "approved",
      expiresAt: 123,
    });
    await service.cancel("profile-one", "session_safe");
    await service.disconnect("profile-one");

    expect(paths).toEqual([
      `/api/providers/oauth/${CODEX_SUBSCRIPTION_PROVIDER}/poll/session_safe?profile=profile-one`,
      "/api/providers/oauth/sessions/session_safe?profile=profile-one",
      `/api/providers/oauth/${CODEX_SUBSCRIPTION_PROVIDER}?profile=profile-one`,
    ]);
  });

  test("rejects malformed Hermes start responses", async () => {
    const request: HermesRequester = async () => ({
      flow: "device_code",
      session_id: "session_safe",
    }) as never;

    await expect(createCodexSubscriptionService(request).start("profile-one"))
      .rejects.toThrow("code utilisateur");
  });

  test("turns unknown poll states into a safe error", async () => {
    const request: HermesRequester = async () => ({ status: "mystery" }) as never;

    await expect(createCodexSubscriptionService(request).poll("profile-one", "session_safe"))
      .resolves.toEqual({
        status: "error",
        error: "Statut Hermes inconnu : mystery.",
      });
  });
});
