import { describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

mock.module("server-only", () => ({}));

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

describe("deleteTenantAndData", () => {
  databaseTest("removes a tenant and its restrict-referenced runtime graph", async () => {
    const [{ db }, schema, { deleteTenantAndData }, { DEFAULT_PERMISSIONS }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("./tenant-deletion"),
      import("@/lib/permissions"),
    ]);
    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({ email: `del-${suffix}@x`, passwordHash: "h", name: "U" })
      .returning();
    const [tenant] = await db
      .insert(schema.tenants)
      .values({ name: "T", slug: `del-${suffix}`, ownerUserId: user.id })
      .returning();
    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ tenantId: tenant.id, name: "W", slug: `del-${suffix}`, hermesBaseUrl: "http://x", permissions: DEFAULT_PERMISSIONS })
      .returning();
    const [installation] = await db
      .insert(schema.runtimeInstallations)
      .values({ tenantId: tenant.id, name: "I", installationKey: `key-${suffix}`, origin: "local_managed", managementLevel: "managed", transport: "direct", gatewayUrl: "http://127.0.0.1:8645", status: "checking", createdByUserId: user.id })
      .returning();
    const [agent] = await db
      .insert(schema.agents)
      .values({ workspaceId: workspace.id, runtimeInstallationId: installation.id, slug: "a", name: "A", hermesProfileName: "p", createdByUserId: user.id })
      .returning();
    const [team] = await db
      .insert(schema.agentTeams)
      .values({ workspaceId: workspace.id, slug: "tm", name: "Team", leadAgentId: agent.id })
      .returning();
    const [item] = await db
      .insert(schema.workItems)
      .values({ workspaceId: workspace.id, key: "T-1", number: 1, title: "x", creatorUserId: user.id, status: "in_progress" })
      .returning();
    const [run] = await db
      .insert(schema.workRuns)
      .values({ workItemId: item.id, workspaceId: workspace.id, agentId: agent.id, runtimeInstallationId: installation.id, hermesProfileName: "p", triggerType: "assignment", originatorUserId: user.id, idempotencyKey: `run-${suffix}`, prompt: "go", status: "running" })
      .returning();
    await db
      .insert(schema.workInterventions)
      .values({ workspaceId: workspace.id, workItemId: item.id, runId: run.id, agentId: agent.id, hermesRequestId: `req-${suffix}`, type: "approval", prompt: "ok?" });

    try {
      await deleteTenantAndData(tenant.id);

      const [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenant.id));
      expect(t).toBeUndefined();
      const remainingRuns = await db.select().from(schema.workRuns).where(eq(schema.workRuns.id, run.id));
      expect(remainingRuns).toHaveLength(0);
      const remainingInstallations = await db
        .select()
        .from(schema.runtimeInstallations)
        .where(eq(schema.runtimeInstallations.id, installation.id));
      expect(remainingInstallations).toHaveLength(0);
      // The user (potentially shared across tenants) must survive.
      const [survivor] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
      expect(survivor).toBeDefined();
      // Silence unused warning for the created team.
      expect(team.id).toBeTruthy();
    } finally {
      await db.delete(schema.users).where(eq(schema.users.id, user.id));
    }
  });

  databaseTest("deleteAccount removes the owner and their owned organization", async () => {
    const [{ db }, schema, { deleteAccount }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("./tenant-deletion"),
    ]);
    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({ email: `acct-${suffix}@x`, passwordHash: "scrypt:a:b", name: "U" })
      .returning();
    const [tenant] = await db
      .insert(schema.tenants)
      .values({ name: "T", slug: `acct-${suffix}`, ownerUserId: user.id })
      .returning();
    await db.insert(schema.tenantMemberships).values({ tenantId: tenant.id, userId: user.id, role: "owner" });

    await deleteAccount(user.id);

    const [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenant.id));
    expect(t).toBeUndefined();
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(u).toBeUndefined();
  });
});
