import { describe, expect, test } from "bun:test";
import { TENANT_CAPABILITIES, TENANT_ROLES, tenantRoleCan } from "./tenant-rbac";

describe("tenant RBAC", () => {
  test("owner can use every tenant capability", () => {
    expect(TENANT_CAPABILITIES.every(({ key }) => tenantRoleCan("owner", key))).toBe(true);
  });

  test("member can work and approve but cannot administer the tenant", () => {
    expect(tenantRoleCan("member", "read")).toBe(true);
    expect(tenantRoleCan("member", "work")).toBe(true);
    expect(tenantRoleCan("member", "approve")).toBe(true);
    expect(tenantRoleCan("member", "runtime")).toBe(false);
    expect(tenantRoleCan("member", "members")).toBe(false);
  });

  test("viewer is read-only", () => {
    expect(TENANT_CAPABILITIES.map(({ key }) => tenantRoleCan("viewer", key))).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  test("the public matrix covers the three supported roles", () => {
    expect(TENANT_ROLES).toEqual(["owner", "member", "viewer"]);
  });
});
