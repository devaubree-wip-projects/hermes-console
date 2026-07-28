import { describe, expect, test } from "bun:test";
import {
  createEnrollmentToken,
  deriveInstallationSecret,
  hashEnrollmentToken,
  signRelayIdentity,
  verifyRelayIdentity,
} from "./relay-identity";

describe("Relay enrollment identities", () => {
  test("creates opaque one-time tokens stored only as hashes", () => {
    const first = createEnrollmentToken();
    const second = createEnrollmentToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(hashEnrollmentToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashEnrollmentToken(first)).not.toContain(first);
  });

  test("derives distinct installation-scoped service and ticket secrets", () => {
    expect(deriveInstallationSecret("service", "edge-a")).not.toBe(deriveInstallationSecret("service", "edge-b"));
    expect(deriveInstallationSecret("service", "edge-a")).not.toBe(deriveInstallationSecret("ticket", "edge-a"));
  });

  test("binds a signed short-lived credential to tenant, installation and certificate", () => {
    const fingerprint = "a".repeat(64);
    const credential = signRelayIdentity({
      tenantId: "tenant-a",
      installationId: "installation-a",
      installationKey: "edge-a",
      fingerprint,
      expiresAt: new Date("2026-07-15T13:00:00Z"),
    });
    expect(verifyRelayIdentity(credential, new Date("2026-07-15T12:00:00Z"))).toEqual({
      version: 1,
      tenantId: "tenant-a",
      installationId: "installation-a",
      installationKey: "edge-a",
      fingerprint,
      exp: Date.parse("2026-07-15T13:00:00Z"),
    });
    expect(() => verifyRelayIdentity(`${credential}x`, new Date("2026-07-15T12:00:00Z"))).toThrow("Signature");
    expect(() => verifyRelayIdentity(credential, new Date("2026-07-15T14:00:00Z"))).toThrow("expirée");
  });
});
