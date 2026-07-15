import { describe, expect, test } from "bun:test";
import { presentEvent, publicEventMetadata } from "./presentation";

describe("event presentation", () => {
  test("presents a Telegram connection without exposing credentials", () => {
    expect(presentEvent("messaging.connected", {
      platform: "telegram",
      runtimeState: "connected",
      token: "secret",
    })).toEqual({
      label: "Channel connecté",
      detail: "Telegram · Connecté",
      tone: "success",
    });
  });

  test("keeps only metadata safe for the event log", () => {
    expect(publicEventMetadata({
      platform: "telegram",
      error: "Gateway indisponible",
      token: "secret",
      env: { TELEGRAM_BOT_TOKEN: "secret" },
    })).toEqual({ platform: "telegram", error: "Gateway indisponible" });
  });

  test("infers an error tone for unknown failed actions", () => {
    expect(presentEvent("runtime.custom_failed").tone).toBe("error");
  });
});
