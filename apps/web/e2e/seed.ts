import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  runtimeCapabilities,
  runtimeInstallations,
  tenantMemberships,
  tenants,
  users,
  workRuns,
  workspaces,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

const email = "e2e@hermes.local";
const password = "e2e-password";
const workInstallationKey =
  process.env.E2E_REAL_WORK === "1" ? "local-default" : "e2e-work";

async function seed() {
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: hashPassword(password),
        name: "Hermes E2E",
        onboardedAt: new Date(),
      })
      .returning();
  }

  let [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, "e2e"))
    .limit(1);
  if (!tenant) {
    [tenant] = await db
      .insert(tenants)
      .values({
        name: "Hermes E2E",
        slug: "e2e",
        ownerUserId: user.id,
      })
      .returning();
  }
  await db
    .insert(tenantMemberships)
    .values({
      tenantId: tenant.id,
      userId: user.id,
      role: "owner",
    })
    .onConflictDoNothing();
  let [viewer] = await db
    .select()
    .from(users)
    .where(eq(users.email, "viewer-e2e@hermes.local"))
    .limit(1);
  if (!viewer) {
    [viewer] = await db
      .insert(users)
      .values({
        email: "viewer-e2e@hermes.local",
        passwordHash: hashPassword("viewer-e2e-password"),
        name: "Hermes Viewer E2E",
        onboardedAt: new Date(),
      })
      .returning();
  }
  await db
    .insert(tenantMemberships)
    .values({
      tenantId: tenant.id,
      userId: viewer.id,
      role: "viewer",
    })
    .onConflictDoUpdate({
      target: [tenantMemberships.tenantId, tenantMemberships.userId],
      set: { role: "viewer" },
    });
  let [member] = await db
    .select()
    .from(users)
    .where(eq(users.email, "member-e2e@hermes.local"))
    .limit(1);
  if (!member) {
    [member] = await db
      .insert(users)
      .values({
        email: "member-e2e@hermes.local",
        passwordHash: hashPassword("member-e2e-password"),
        name: "Hermes Member E2E",
        onboardedAt: new Date(),
      })
      .returning();
  }
  await db
    .insert(tenantMemberships)
    .values({
      tenantId: tenant.id,
      userId: member.id,
      role: "member",
    })
    .onConflictDoUpdate({
      target: [tenantMemberships.tenantId, tenantMemberships.userId],
      set: { role: "member" },
    });
  const [installation] = await db
    .insert(runtimeInstallations)
    .values({
      tenantId: tenant.id,
      name: "Hermes E2E",
      installationKey: workInstallationKey,
      origin: "local_managed",
      managementLevel: "managed",
      transport: "direct",
      gatewayUrl: "http://127.0.0.1:8787",
      status: "ready",
      gatewayProtocolVersion: 1,
      hermesVersion: "2026.7.7.2",
      detectedRuntime: "docker",
      lastSeenAt: new Date(),
      createdByUserId: user.id,
    })
    .onConflictDoUpdate({
      target: [
        runtimeInstallations.tenantId,
        runtimeInstallations.installationKey,
      ],
      set: {
        name: "Hermes E2E",
        status: "ready",
        gatewayUrl: "http://127.0.0.1:8787",
        gatewayProtocolVersion: 1,
        hermesVersion: "2026.7.7.2",
        detectedRuntime: "docker",
        lastSeenAt: new Date(),
      },
    })
    .returning();
  await db
    .update(runtimeInstallations)
    .set({ name: "Hermes local historique" })
    .where(
      and(
        eq(runtimeInstallations.tenantId, tenant.id),
        eq(runtimeInstallations.name, "Hermes E2E"),
        ne(runtimeInstallations.id, installation.id),
      ),
    );
  await db
    .insert(runtimeCapabilities)
    .values({
      installationId: installation.id,
      protocolVersion: 1,
      features: ["runtime.http", "runtime.websocket", "runtime.preflight"],
      lifecycle: ["start", "restart"],
      profiles: [
        {
          name: "default",
          provider: "openai",
          model: "gpt-test",
          gatewayRunning: true,
        },
      ],
      limits: { maxFrameBytes: 1_048_576, requestsPerMinute: 120 },
    })
    .onConflictDoUpdate({
      target: runtimeCapabilities.installationId,
      set: {
        protocolVersion: 1,
        features: ["runtime.http", "runtime.websocket", "runtime.preflight"],
        lifecycle: ["start", "restart"],
        profiles: [
          {
            name: "default",
            provider: "openai",
            model: "gpt-test",
            gatewayRunning: true,
          },
        ],
        updatedAt: new Date(),
      },
    });
  if (process.env.E2E_REAL_WORK !== "1") {
    await db
      .update(workRuns)
      .set({
        status: "cancelled",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workRuns.runtimeInstallationId, installation.id),
          inArray(workRuns.status, [
            "queued",
            "preparing",
            "running",
            "waiting_input",
            "cancelling",
          ]),
        ),
      );
  }
  await db
    .insert(runtimeInstallations)
    .values({
      tenantId: tenant.id,
      name: "Hermes sans agent",
      installationKey: "workspace-unassigned",
      origin: "remote_existing",
      managementLevel: "external",
      transport: "direct",
      gatewayUrl: "https://unassigned.invalid",
      status: "offline",
      createdByUserId: user.id,
    })
    .onConflictDoUpdate({
      target: [
        runtimeInstallations.tenantId,
        runtimeInstallations.installationKey,
      ],
      set: { name: "Hermes sans agent", status: "offline" },
    });

  let [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, "e2e"))
    .limit(1);
  if (!workspace) {
    [workspace] = await db
      .insert(workspaces)
      .values({
        tenantId: tenant.id,
        name: "Hermes E2E",
        slug: "e2e",
        hermesBaseUrl: "http://127.0.0.1:8787",
        permissions: DEFAULT_PERMISSIONS,
      })
      .returning();
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspace.id),
        eq(agents.slug, "assistant-principal"),
      ),
    )
    .limit(1);
  if (!agent) {
    await db
      .insert(agents)
      .values({
        workspaceId: workspace.id,
        runtimeInstallationId: installation.id,
        slug: "assistant-principal",
        name: "Assistant principal",
        description: "Agent déterministe pour les tests du composer",
        hermesProfileName: "default",
        runtimeState: "ready",
        createdByUserId: user.id,
      })
      .onConflictDoNothing();
  } else {
    await db
      .update(agents)
      .set({
        runtimeInstallationId: installation.id,
        hermesProfileName: "default",
        runtimeState: "ready",
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id));
  }
  const [reviewer] = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.workspaceId, workspace.id), eq(agents.slug, "reviewer")),
    )
    .limit(1);
  if (!reviewer) {
    await db.insert(agents).values({
      workspaceId: workspace.id,
      runtimeInstallationId: installation.id,
      slug: "reviewer",
      name: "Reviewer",
      description: "Membre déterministe pour les délégations E2E",
      hermesProfileName: "e2e-reviewer",
      runtimeState: "ready",
      createdByUserId: user.id,
    });
  } else {
    await db
      .update(agents)
      .set({
        runtimeInstallationId: installation.id,
        hermesProfileName: "e2e-reviewer",
        runtimeState: "ready",
        updatedAt: new Date(),
      })
      .where(eq(agents.id, reviewer.id));
  }

  let [isolatedUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, "isolated@hermes.local"))
    .limit(1);
  if (!isolatedUser) {
    [isolatedUser] = await db
      .insert(users)
      .values({
        email: "isolated@hermes.local",
        passwordHash: hashPassword("isolated-password"),
        name: "Tenant isolé",
        onboardedAt: new Date(),
      })
      .returning();
  }
  let [isolatedTenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, "isolated"))
    .limit(1);
  if (!isolatedTenant) {
    [isolatedTenant] = await db
      .insert(tenants)
      .values({
        name: "Tenant isolé",
        slug: "isolated",
        ownerUserId: isolatedUser.id,
      })
      .returning();
  }
  await db
    .insert(tenantMemberships)
    .values({
      tenantId: isolatedTenant.id,
      userId: isolatedUser.id,
      role: "owner",
    })
    .onConflictDoNothing();
  await db
    .insert(runtimeInstallations)
    .values({
      id: "00000000-0000-4000-8000-000000000002",
      tenantId: isolatedTenant.id,
      name: "Hermes secret tenant B",
      installationKey: "isolated-runtime",
      origin: "remote_existing",
      managementLevel: "external",
      transport: "direct",
      gatewayUrl: "https://isolated.invalid",
      status: "ready",
      createdByUserId: isolatedUser.id,
    })
    .onConflictDoUpdate({
      target: [
        runtimeInstallations.tenantId,
        runtimeInstallations.installationKey,
      ],
      set: { name: "Hermes secret tenant B" },
    })
    .returning();
  const [isolatedWorkspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, "isolated"))
    .limit(1);
  if (!isolatedWorkspace) {
    await db.insert(workspaces).values({
      tenantId: isolatedTenant.id,
      name: "Workspace isolé",
      slug: "isolated",
      hermesBaseUrl: "http://127.0.0.1:8787",
      permissions: DEFAULT_PERMISSIONS,
    });
  }
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
