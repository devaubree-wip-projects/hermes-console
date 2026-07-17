import { describe, expect, test } from "bun:test";
import {
  isProfileGatewayRunning,
  resolvedPlatformError,
  resolvedPlatformState,
} from "@/lib/hermes/messaging-status";

describe("profile-scoped messaging state", () => {
  test("does not mistake the default gateway for a named profile gateway", () => {
    expect(isProfileGatewayRunning({
      profile: "assistant-principal",
      topology: {
        gatewayRunning: true,
        gateways: [{ profile: "default" }],
      },
      platformReportedRunning: true,
    })).toBe(false);
  });

  test("recognizes a named profile gateway once s6 serves it", () => {
    expect(isProfileGatewayRunning({
      profile: "assistant-principal",
      topology: {
        gateways: [{ profile: "default" }, { profile: "assistant-principal" }],
      },
    })).toBe(true);
  });

  test("uses the profile state file once the topology proves the gateway is live", () => {
    expect(resolvedPlatformState({
      gatewayRunning: true,
      topologyState: null,
      localState: "connected",
      platformState: "pending_restart",
      enabled: true,
      configured: true,
    })).toBe("connected");
  });

  test("ignores a stale retry after the credential is deleted", () => {
    expect(resolvedPlatformState({
      gatewayRunning: true,
      topologyState: "retrying",
      localState: "retrying",
      platformState: "retrying",
      enabled: false,
      configured: false,
    })).toBe("not_configured");

    expect(resolvedPlatformError({
      runtimeError: "Telegram startup failed with the deleted token.",
      platformError: "Previous Telegram error.",
      enabled: false,
      configured: false,
    })).toBeNull();
  });

  test("reports a configured but disabled platform as disabled", () => {
    expect(resolvedPlatformState({
      gatewayRunning: true,
      topologyState: "retrying",
      localState: "retrying",
      platformState: "retrying",
      enabled: false,
      configured: true,
    })).toBe("disabled");
  });
});
