import { describe, expect, test } from "bun:test";
import { legacyTenantRedirectPath } from "./tenant-routing";

describe("tenant-only route compatibility", () => {
  test("canonicalizes historical tenant/workspace page URLs", () => {
    expect(legacyTenantRedirectPath("/acme/acme/tasks/42")).toBe("/acme/tasks/42");
    expect(legacyTenantRedirectPath("/acme/other/tasks/42")).toBe("/acme/tasks/42");
    expect(legacyTenantRedirectPath("/api/acme/acme/work-items")).toBeNull();
    expect(legacyTenantRedirectPath("/api/acme/projects")).toBeNull();
  });

  test("keeps nested tenant-only settings routes out of the legacy redirect", () => {
    for (const panel of ["chat", "models", "tools"]) {
      expect(legacyTenantRedirectPath(`/acme/settings/${panel}`)).toBeNull();
    }
  });

  test("leaves canonical tenant pages, APIs and public routes untouched", () => {
    expect(legacyTenantRedirectPath("/acme/tasks/42")).toBeNull();
    expect(legacyTenantRedirectPath("/api/acme/work-items/42")).toBeNull();
    expect(legacyTenantRedirectPath("/login")).toBeNull();
  });
});
