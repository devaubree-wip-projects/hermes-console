import { describe, expect, test } from "bun:test";
import { sessionOrigin } from "@/lib/hermes/session-origin";

describe("sessionOrigin", () => {
  test("identifies Telegram sessions", () => {
    expect(sessionOrigin("telegram")).toEqual({ id: "telegram", label: "Telegram" });
  });

  test("identifies the other configured messaging channel", () => {
    expect(sessionOrigin("discord")).toEqual({ id: "discord", label: "Discord" });
  });

  test("does not badge the default web channel", () => {
    expect(sessionOrigin("web")).toBeNull();
    expect(sessionOrigin(null)).toBeNull();
  });

  test("keeps future Hermes sources legible", () => {
    expect(sessionOrigin("google_chat")).toEqual({
      id: "google_chat",
      label: "Google Chat",
    });
  });
});
