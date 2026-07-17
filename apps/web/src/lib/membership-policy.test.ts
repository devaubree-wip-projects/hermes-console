import { describe, expect, test } from "bun:test";
import { isSafeInternalPath } from "./console-url";
import { invitationAcceptError } from "./membership-policy";

describe("invitationAcceptError", () => {
  const invitation = {
    email: "invitee@example.com",
    expiresAt: new Date(Date.now() + 1000 * 60),
  };

  test("accepts a live invitation for the matching account", () => {
    expect(invitationAcceptError(invitation, "invitee@example.com")).toBeNull();
    expect(invitationAcceptError(invitation, "Invitee@Example.COM")).toBeNull();
  });

  test("rejects an expired invitation", () => {
    expect(
      invitationAcceptError({ ...invitation, expiresAt: new Date(Date.now() - 1) }, "invitee@example.com"),
    ).toBe("expired");
  });

  test("rejects an account whose email differs from the invited one", () => {
    expect(invitationAcceptError(invitation, "someone-else@example.com")).toBe("email_mismatch");
  });
});

describe("isSafeInternalPath", () => {
  test("accepts same-origin absolute paths", () => {
    expect(isSafeInternalPath("/invitations/accept?token=abc")).toBe(true);
    expect(isSafeInternalPath("/atelier/dashboard")).toBe(true);
  });

  test("rejects external or malformed destinations", () => {
    expect(isSafeInternalPath("//evil.example.com")).toBe(false);
    expect(isSafeInternalPath("https://evil.example.com")).toBe(false);
    expect(isSafeInternalPath("relative/path")).toBe(false);
    expect(isSafeInternalPath(undefined)).toBe(false);
    expect(isSafeInternalPath(42)).toBe(false);
  });
});
