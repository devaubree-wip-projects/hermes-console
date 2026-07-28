import { beforeEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

mock.module("server-only", () => ({}));

class FakeHermesRuntimeError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const runtime = {
  profiles: new Set<string>(),
  createCalls: [] as Array<{ name: string; installationId?: string }>,
  createFailure: null as Error | null,
  missionFailure: null as Error | null,
  createBarrier: null as Promise<void> | null,
};

mock.module("@/lib/hermes/server", () => ({
  HermesRuntimeError: FakeHermesRuntimeError,
  createHermesProfile: async (
    input: { name: string },
    scope: { installationId?: string },
  ) => {
    runtime.createCalls.push({ name: input.name, installationId: scope.installationId });
    if (runtime.createBarrier) await runtime.createBarrier;
    if (runtime.createFailure) throw runtime.createFailure;
    if (runtime.profiles.has(input.name))
      throw new FakeHermesRuntimeError("Profile already exists.", 409);
    runtime.profiles.add(input.name);
    return { ok: true, name: input.name };
  },
}));

mock.module("@/lib/hermes/mission-sync", () => ({
  publishAgentMission: async () => {
    if (runtime.missionFailure) throw runtime.missionFailure;
  },
}));

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

beforeEach(() => {
  runtime.profiles.clear();
  runtime.createCalls.length = 0;
  runtime.createFailure = null;
  runtime.missionFailure = null;
  runtime.createBarrier = null;
});

async function seedProvisioningContext(suffix: string) {
  const [{ db }, schema] = await Promise.all([import("@/db"), import("@/db/schema")]);
  const [user] = await db
    .insert(schema.users)
    .values({
      email: `agent-create-${suffix}@hermes.local`,
      passwordHash: "integration-test-only",
      name: `Agent Create ${suffix}`,
    })
    .returning();
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      name: `Agent Create ${suffix}`,
      slug: `agent-create-${suffix}`,
      ownerUserId: user.id,
    })
    .returning();
  const [workspace] = await db
    .insert(schema.workspaces)
    .values({
      tenantId: tenant.id,
      name: "Organisation",
      slug: `workspace-${suffix}`,
      hermesBaseUrl: "http://127.0.0.1:8787",
      permissions: DEFAULT_PERMISSIONS,
    })
    .returning();
  const [installation] = await db
    .insert(schema.runtimeInstallations)
    .values({
      tenantId: tenant.id,
      name: "Edge distant",
      installationKey: `agent-edge-${suffix}`,
      origin: "remote_existing",
      managementLevel: "connected",
      gatewayUrl: "https://edge.example.test",
      status: "ready",
      createdByUserId: user.id,
    })
    .returning();
  return {
    db,
    schema,
    user,
    tenant,
    workspace,
    installation,
    access: { tenant, workspace, role: "owner" as const },
  };
}

async function cleanupProvisioningContext(
  context: Awaited<ReturnType<typeof seedProvisioningContext>>,
) {
  const { eq } = await import("drizzle-orm");
  await context.db
    .delete(context.schema.agents)
    .where(eq(context.schema.agents.workspaceId, context.workspace.id));
  await context.db
    .delete(context.schema.tenants)
    .where(eq(context.schema.tenants.id, context.tenant.id));
  await context.db
    .delete(context.schema.users)
    .where(eq(context.schema.users.id, context.user.id));
}

describe("createAgent provisioning truth", () => {
  test("rejects malformed installation and source identifiers before querying PostgreSQL", async () => {
    const { createAgent } = await import("./create-agent");
    const base = {
      access: { role: "owner" } as never,
      actorUserId: randomUUID(),
      name: "Assistant validé",
      description: "Mission.",
      idempotencyKey: `validation-${randomUUID()}`,
      origin: { source: "console" as const },
    };

    await expect(createAgent({
      ...base,
      installationId: "not-a-uuid",
    })).rejects.toMatchObject({ code: "invalid_installation_id", status: 400 });
    await expect(createAgent({
      ...base,
      sourceAgentId: "not-a-uuid",
    })).rejects.toMatchObject({ code: "invalid_source_agent_id", status: 400 });
  });

  databaseTest("honors the selected installation and reuses one row/profile per key", async () => {
    const suffix = randomUUID().slice(0, 8);
    const context = await seedProvisioningContext(suffix);
    const { createAgent } = await import("./create-agent");
    try {
      const input = {
        access: context.access,
        actorUserId: context.user.id,
        name: "Assistant opérations",
        description: "Pilote les opérations.",
        installationId: context.installation.id,
        idempotencyKey: `request-${suffix}`,
        origin: { source: "console" as const },
      };
      const first = await createAgent(input);
      const retry = await createAgent(input);

      expect(first.runtimeState).toBe("ready");
      expect(first.agent.runtimeInstallationId).toBe(context.installation.id);
      expect(first.installationId).toBe(context.installation.id);
      expect(first.reused).toBe(false);
      expect(retry.agent.id).toBe(first.agent.id);
      expect(retry.reused).toBe(true);
      expect(runtime.createCalls).toHaveLength(1);
      expect(runtime.createCalls[0]?.installationId).toBe(context.installation.id);
    } finally {
      await cleanupProvisioningContext(context);
    }
  });

  databaseTest("persists a runtime failure and resumes the same agent on retry", async () => {
    const suffix = randomUUID().slice(0, 8);
    const context = await seedProvisioningContext(suffix);
    const { createAgent } = await import("./create-agent");
    try {
      const input = {
        access: context.access,
        actorUserId: context.user.id,
        name: "Assistant résilient",
        description: "Reprend le provisionnement.",
        sourceAgentId: null,
        installationId: context.installation.id,
        idempotencyKey: `retry-${suffix}`,
        origin: { source: "console" as const },
      };
      runtime.createFailure = new FakeHermesRuntimeError("Edge indisponible.");
      const failed = await createAgent(input);

      expect(failed.runtimeState).toBe("setup_required");
      expect(failed.runtimeError).toBe("Edge indisponible.");
      expect(failed.agent.runtimeState).toBe("setup_required");

      runtime.createFailure = null;
      const resumed = await createAgent(input);

      expect(resumed.agent.id).toBe(failed.agent.id);
      expect(resumed.runtimeState).toBe("ready");
      expect(resumed.runtimeError).toBeNull();
      expect(resumed.reused).toBe(true);
    } finally {
      await cleanupProvisioningContext(context);
    }
  });

  databaseTest("serializes concurrent retries before calling Hermes", async () => {
    const suffix = randomUUID().slice(0, 8);
    const context = await seedProvisioningContext(suffix);
    const { createAgent } = await import("./create-agent");
    let releaseProfile!: () => void;
    runtime.createBarrier = new Promise<void>((resolve) => {
      releaseProfile = resolve;
    });
    try {
      const input = {
        access: context.access,
        actorUserId: context.user.id,
        name: "Assistant concurrent",
        description: "Une seule création runtime.",
        installationId: context.installation.id,
        idempotencyKey: `concurrent-${suffix}`,
        origin: { source: "console" as const },
      };
      const firstRequest = createAgent(input);
      while (runtime.createCalls.length === 0) await Bun.sleep(1);
      const { eq } = await import("drizzle-orm");
      const [reserved] = await context.db
        .select()
        .from(context.schema.agents)
        .where(eq(
          context.schema.agents.provisioningIdempotencyKey,
          input.idempotencyKey,
        ))
        .limit(1);
      expect(reserved).toMatchObject({
        runtimeState: "setup_required",
        runtimeError: "Provisionnement du profil Hermes en cours.",
      });
      const concurrentRetry = createAgent(input);
      await Bun.sleep(10);
      expect(runtime.createCalls).toHaveLength(1);

      releaseProfile();
      const [first, retry] = await Promise.all([firstRequest, concurrentRetry]);

      expect(retry.agent.id).toBe(first.agent.id);
      expect(retry.reused).toBe(true);
      expect(runtime.createCalls).toHaveLength(1);
    } finally {
      releaseProfile();
      await cleanupProvisioningContext(context);
    }
  });

  databaseTest("refuses a contradictory replay for the same key", async () => {
    const suffix = randomUUID().slice(0, 8);
    const context = await seedProvisioningContext(suffix);
    const { createAgent } = await import("./create-agent");
    try {
      const base = {
        access: context.access,
        actorUserId: context.user.id,
        name: "Assistant stable",
        description: "Demande originale.",
        installationId: context.installation.id,
        idempotencyKey: `conflict-${suffix}`,
        origin: { source: "console" as const },
      };
      const created = await createAgent(base);

      await expect(createAgent({
        ...base,
        description: "Payload contradictoire.",
      })).rejects.toMatchObject({ code: "idempotency_conflict", status: 409 });
      expect(runtime.createCalls).toHaveLength(1);

      const { count, eq } = await import("drizzle-orm");
      const [rows] = await context.db
        .select({ total: count() })
        .from(context.schema.agents)
        .where(eq(context.schema.agents.provisioningIdempotencyKey, base.idempotencyKey));
      expect(rows?.total).toBe(1);
      expect(created.runtimeState).toBe("ready");
    } finally {
      await cleanupProvisioningContext(context);
    }
  });

  databaseTest("resumes mission publication when the profile already exists", async () => {
    const suffix = randomUUID().slice(0, 8);
    const context = await seedProvisioningContext(suffix);
    const { createAgent } = await import("./create-agent");
    try {
      const input = {
        access: context.access,
        actorUserId: context.user.id,
        name: "Assistant mission",
        description: "Mission durable.",
        installationId: context.installation.id,
        idempotencyKey: `mission-${suffix}`,
        origin: { source: "console" as const },
      };
      runtime.missionFailure = new Error("Écriture SOUL.md impossible.");
      const failed = await createAgent(input);
      expect(failed.runtimeState).toBe("error");

      runtime.missionFailure = null;
      const resumed = await createAgent(input);

      expect(resumed.agent.id).toBe(failed.agent.id);
      expect(resumed.runtimeState).toBe("ready");
      expect(runtime.createCalls).toHaveLength(2);
    } finally {
      await cleanupProvisioningContext(context);
    }
  });
});
