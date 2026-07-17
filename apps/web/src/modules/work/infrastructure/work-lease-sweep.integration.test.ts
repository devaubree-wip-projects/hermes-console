import { describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

mock.module("server-only", () => ({}));

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

describe("sweepExpiredLeases", () => {
  databaseTest("requeues a run orphaned by an offline edge", async () => {
    const [{ db }, schema, { sweepExpiredLeases }, { DEFAULT_PERMISSIONS }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("./work-runtime-service"),
      import("@/lib/permissions"),
    ]);
    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({ email: `sweep-${suffix}@x`, passwordHash: "h", name: "U" })
      .returning();
    const [tenant] = await db
      .insert(schema.tenants)
      .values({ name: "T", slug: `sweep-${suffix}`, ownerUserId: user.id })
      .returning();
    try {
      const [workspace] = await db
        .insert(schema.workspaces)
        .values({ tenantId: tenant.id, name: "W", slug: `sweep-${suffix}`, hermesBaseUrl: "http://x", permissions: DEFAULT_PERMISSIONS })
        .returning();
      const [installation] = await db
        .insert(schema.runtimeInstallations)
        .values({
          tenantId: tenant.id,
          name: "I",
          installationKey: `key-${suffix}`,
          origin: "local_managed",
          managementLevel: "managed",
          transport: "direct",
          gatewayUrl: "http://127.0.0.1:8645",
          status: "checking",
          createdByUserId: user.id,
        })
        .returning();
      const [agent] = await db
        .insert(schema.agents)
        .values({ workspaceId: workspace.id, runtimeInstallationId: installation.id, slug: "a", name: "A", hermesProfileName: "p", createdByUserId: user.id })
        .returning();
      const [item] = await db
        .insert(schema.workItems)
        .values({ workspaceId: workspace.id, key: "T-1", number: 1, title: "x", creatorUserId: user.id, status: "in_progress" })
        .returning();
      const [run] = await db
        .insert(schema.workRuns)
        .values({
          workItemId: item.id,
          workspaceId: workspace.id,
          agentId: agent.id,
          runtimeInstallationId: installation.id,
          hermesProfileName: "p",
          triggerType: "assignment",
          originatorUserId: user.id,
          idempotencyKey: `run-${suffix}`,
          prompt: "go",
          status: "running",
          attempt: 1,
          maxAttempts: 2,
          claimedByEdgeId: "dead-edge",
          leaseExpiresAt: new Date(Date.now() - 60_000),
        })
        .returning();

      const result = await sweepExpiredLeases();
      expect(result.requeued).toBeGreaterThanOrEqual(1);

      const [after] = await db.select().from(schema.workRuns).where(eq(schema.workRuns.id, run.id));
      expect(after.status).toBe("queued");
      expect(after.attempt).toBe(2);
      expect(after.leaseExpiresAt).toBeNull();
      expect(after.claimedByEdgeId).toBeNull();
    } finally {
      // work_runs/agents hold restrict refs to the installation; clear them first.
      const workspaceIds = db
        .select({ id: schema.workspaces.id })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.tenantId, tenant.id));
      await db.delete(schema.workRuns).where(inArray(schema.workRuns.workspaceId, workspaceIds));
      await db.delete(schema.agents).where(inArray(schema.agents.workspaceId, workspaceIds));
      await db.delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
      await db.delete(schema.users).where(eq(schema.users.id, user.id));
    }
  });
});
