import { describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

mock.module("server-only", () => ({}));

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

async function seedTenant(suffix: string) {
  const [{ db }, schema] = await Promise.all([import("@/db"), import("@/db/schema")]);
  const [user] = await db
    .insert(schema.users)
    .values({
      email: `installations-${suffix}@hermes.local`,
      passwordHash: "integration-test-only",
      name: `Installations ${suffix}`,
    })
    .returning();
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      name: `Installations ${suffix}`,
      slug: `installations-${suffix}`,
      ownerUserId: user.id,
    })
    .returning();
  return { user, tenant };
}

describe("Environment installation key ownership", () => {
  databaseTest("gives the environment key to one tenant and a generated key to the next", async () => {
    const [{ db }, schema, installations] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("./installations"),
    ]);
    const suffix = randomUUID().slice(0, 8);
    const environmentKey = `env-${suffix}`;
    process.env.HERMES_DEFAULT_INSTALLATION_ID = environmentKey;
    const first = await seedTenant(`first-${suffix}`);
    const second = await seedTenant(`second-${suffix}`);
    try {
      const a = await installations.insertEnvironmentRuntimeInstallation(db, {
        tenantId: first.tenant.id,
        createdByUserId: first.user.id,
      });
      const b = await installations.insertEnvironmentRuntimeInstallation(db, {
        tenantId: second.tenant.id,
        createdByUserId: second.user.id,
      });

      expect(a.installationKey).toBe(environmentKey);
      // Sharing it would hand the second tenant the first one's signing secret.
      expect(b.installationKey).not.toBe(environmentKey);
      expect(b.installationKey.startsWith("edge_")).toBe(true);
    } finally {
      delete process.env.HERMES_DEFAULT_INSTALLATION_ID;
      const { inArray } = await import("drizzle-orm");
      const owners = [first, second];
      await db
        .delete(schema.runtimeInstallations)
        .where(inArray(schema.runtimeInstallations.tenantId, owners.map((o) => o.tenant.id)));
      await db
        .delete(schema.tenants)
        .where(inArray(schema.tenants.id, owners.map((o) => o.tenant.id)));
      await db
        .delete(schema.users)
        .where(inArray(schema.users.id, owners.map((o) => o.user.id)));
    }
  });

  databaseTest("generated keys satisfy the Edge installation key format", async () => {
    const { generateInstallationKey, INSTALLATION_KEY_PATTERN } = await import("@/modules/installations/domain/installation");
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(INSTALLATION_KEY_PATTERN.test(generateInstallationKey())).toBe(true);
    }
  });
});

describe("Agent provisioning installation selection", () => {
  databaseTest("honors an explicit connected installation owned by the tenant", async () => {
    const [{ db }, schema, installations] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("./installations"),
    ]);
    const suffix = randomUUID().slice(0, 8);
    const owner = await seedTenant(`selection-${suffix}`);
    try {
      const [remote] = await db
        .insert(schema.runtimeInstallations)
        .values({
          tenantId: owner.tenant.id,
          name: "Edge distant",
          installationKey: `remote-${suffix}`,
          origin: "remote_existing",
          managementLevel: "connected",
          gatewayUrl: "https://edge.example.test",
          status: "ready",
          createdByUserId: owner.user.id,
        })
        .returning();

      const selected = await installations.resolveAgentProvisioningInstallation({
        tenantId: owner.tenant.id,
        actorUserId: owner.user.id,
        installationId: remote.id,
      });

      expect(selected.id).toBe(remote.id);
      expect(selected.managementLevel).toBe("connected");
    } finally {
      await db.delete(schema.tenants).where((await import("drizzle-orm")).eq(schema.tenants.id, owner.tenant.id));
      await db.delete(schema.users).where((await import("drizzle-orm")).eq(schema.users.id, owner.user.id));
    }
  });

  databaseTest("refuses external and cross-tenant installations", async () => {
    const [{ db }, schema, installations] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("./installations"),
    ]);
    const suffix = randomUUID().slice(0, 8);
    const owner = await seedTenant(`owner-${suffix}`);
    const stranger = await seedTenant(`stranger-${suffix}`);
    try {
      const [external] = await db
        .insert(schema.runtimeInstallations)
        .values({
          tenantId: owner.tenant.id,
          name: "Lecture seule",
          installationKey: `external-${suffix}`,
          origin: "remote_existing",
          managementLevel: "external",
          gatewayUrl: "https://external.example.test",
          status: "ready",
          createdByUserId: owner.user.id,
        })
        .returning();

      await expect(installations.resolveAgentProvisioningInstallation({
        tenantId: owner.tenant.id,
        actorUserId: owner.user.id,
        installationId: external.id,
      })).rejects.toMatchObject({ code: "installation_not_mutable", status: 409 });
      await expect(installations.resolveAgentProvisioningInstallation({
        tenantId: stranger.tenant.id,
        actorUserId: stranger.user.id,
        installationId: external.id,
      })).rejects.toMatchObject({ code: "installation_forbidden", status: 403 });
    } finally {
      const { inArray } = await import("drizzle-orm");
      await db.delete(schema.tenants).where(inArray(schema.tenants.id, [owner.tenant.id, stranger.tenant.id]));
      await db.delete(schema.users).where(inArray(schema.users.id, [owner.user.id, stranger.user.id]));
    }
  });

  databaseTest("validates source provenance and requires a mutable target", async () => {
    const [{ db }, schema, installations] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("./installations"),
    ]);
    const suffix = randomUUID().slice(0, 8);
    const owner = await seedTenant(`source-owner-${suffix}`);
    const stranger = await seedTenant(`source-stranger-${suffix}`);
    const createdAgentIds: string[] = [];
    try {
      const [ownerWorkspace] = await db
        .insert(schema.workspaces)
        .values({
          tenantId: owner.tenant.id,
          name: "Organisation owner",
          slug: `source-owner-${suffix}`,
          hermesBaseUrl: "http://127.0.0.1:8787",
          permissions: DEFAULT_PERMISSIONS,
        })
        .returning();
      const [strangerWorkspace] = await db
        .insert(schema.workspaces)
        .values({
          tenantId: stranger.tenant.id,
          name: "Organisation stranger",
          slug: `source-stranger-${suffix}`,
          hermesBaseUrl: "http://127.0.0.1:8787",
          permissions: DEFAULT_PERMISSIONS,
        })
        .returning();
      const [mutable, immutable] = await db
        .insert(schema.runtimeInstallations)
        .values([
          {
            tenantId: owner.tenant.id,
            name: "Edge mutable",
            installationKey: `mutable-${suffix}`,
            origin: "remote_existing",
            managementLevel: "connected",
            gatewayUrl: "https://mutable.example.test",
            status: "ready",
            createdByUserId: owner.user.id,
          },
          {
            tenantId: owner.tenant.id,
            name: "Edge externe",
            installationKey: `immutable-${suffix}`,
            origin: "remote_existing",
            managementLevel: "external",
            gatewayUrl: "https://immutable.example.test",
            status: "ready",
            createdByUserId: owner.user.id,
          },
        ])
        .returning();
      const [ownerSource] = await db
        .insert(schema.agents)
        .values({
          workspaceId: ownerWorkspace.id,
          runtimeInstallationId: immutable.id,
          slug: "owner-source",
          name: "Owner source",
          hermesProfileName: `owner-source-${suffix}`,
          runtimeState: "ready",
          createdByUserId: owner.user.id,
        })
        .returning();
      createdAgentIds.push(ownerSource.id);
      const [foreignSource] = await db
        .insert(schema.agents)
        .values({
          workspaceId: strangerWorkspace.id,
          slug: "foreign-source",
          name: "Foreign source",
          hermesProfileName: `foreign-source-${suffix}`,
          runtimeState: "ready",
          createdByUserId: stranger.user.id,
        })
        .returning();
      createdAgentIds.push(foreignSource.id);

      await expect(installations.resolveAgentProvisioningInstallation({
        tenantId: owner.tenant.id,
        actorUserId: owner.user.id,
        installationId: mutable.id,
        sourceAgentId: foreignSource.id,
      })).rejects.toMatchObject({ code: "source_agent_forbidden", status: 403 });
      await expect(installations.resolveAgentProvisioningInstallation({
        tenantId: owner.tenant.id,
        actorUserId: owner.user.id,
        sourceAgentId: ownerSource.id,
      })).rejects.toMatchObject({
        code: "source_installation_not_mutable",
        status: 409,
      });

      const explicitFallback = await installations.resolveAgentProvisioningInstallation({
        tenantId: owner.tenant.id,
        actorUserId: owner.user.id,
        installationId: mutable.id,
        sourceAgentId: ownerSource.id,
      });
      expect(explicitFallback.id).toBe(mutable.id);
    } finally {
      const { inArray } = await import("drizzle-orm");
      if (createdAgentIds.length)
        await db.delete(schema.agents).where(inArray(schema.agents.id, createdAgentIds));
      await db.delete(schema.tenants).where(inArray(schema.tenants.id, [
        owner.tenant.id,
        stranger.tenant.id,
      ]));
      await db.delete(schema.users).where(inArray(schema.users.id, [
        owner.user.id,
        stranger.user.id,
      ]));
    }
  });

  databaseTest("inherits the source agent installation", async () => {
    const [{ db }, schema, installations] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("./installations"),
    ]);
    const suffix = randomUUID().slice(0, 8);
    const owner = await seedTenant(`source-${suffix}`);
    let workspaceId: string | null = null;
    try {
      const [workspace] = await db
        .insert(schema.workspaces)
        .values({
          tenantId: owner.tenant.id,
          name: "Organisation",
          slug: `source-${suffix}`,
          hermesBaseUrl: "http://127.0.0.1:8787",
          permissions: DEFAULT_PERMISSIONS,
        })
        .returning();
      workspaceId = workspace.id;
      const [remote] = await db
        .insert(schema.runtimeInstallations)
        .values({
          tenantId: owner.tenant.id,
          name: "Edge source",
          installationKey: `source-edge-${suffix}`,
          origin: "remote_provisioned",
          managementLevel: "managed",
          gatewayUrl: "https://source.example.test",
          status: "ready",
          createdByUserId: owner.user.id,
        })
        .returning();
      const [sourceAgent] = await db
        .insert(schema.agents)
        .values({
          workspaceId: workspace.id,
          runtimeInstallationId: remote.id,
          slug: "source",
          name: "Source",
          hermesProfileName: `source-${suffix}`,
          runtimeState: "ready",
          createdByUserId: owner.user.id,
        })
        .returning();

      const selected = await installations.resolveAgentProvisioningInstallation({
        tenantId: owner.tenant.id,
        actorUserId: owner.user.id,
        sourceAgentId: sourceAgent.id,
      });

      expect(selected.id).toBe(remote.id);
    } finally {
      const { eq } = await import("drizzle-orm");
      if (workspaceId)
        await db.delete(schema.agents).where(eq(schema.agents.workspaceId, workspaceId));
      await db.delete(schema.tenants).where(eq(schema.tenants.id, owner.tenant.id));
      await db.delete(schema.users).where(eq(schema.users.id, owner.user.id));
    }
  });
});
