import { describe, expect, test } from "bun:test";
import { isProfileGatewayRunning, resolvedPlatformState } from "@/lib/hermes/messaging-status";

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
});
