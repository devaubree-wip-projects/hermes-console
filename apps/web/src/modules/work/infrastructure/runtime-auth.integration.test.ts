import { describe, expect, mock, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";

mock.module("server-only", () => ({}));

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

async function seedTenant(suffix: string) {
  const [{ db }, schema] = await Promise.all([import("@/db"), import("@/db/schema")]);
  const [user] = await db
    .insert(schema.users)
    .values({
      email: `runtime-auth-${suffix}@hermes.local`,
      passwordHash: "integration-test-only",
      name: `Runtime auth ${suffix}`,
    })
    .returning();
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      name: `Runtime auth ${suffix}`,
      slug: `runtime-auth-${suffix}`,
      ownerUserId: user.id,
    })
    .returning();
  return { user, tenant };
}

function installationValues(tenantId: string, userId: string, installationKey: string) {
  return {
    tenantId,
    name: `Edge ${installationKey}`,
    installationKey,
    origin: "remote_existing" as const,
    managementLevel: "connected" as const,
    gatewayUrl: "https://edge.hermes.local",
    status: "ready" as const,
    createdByUserId: userId,
  };
}

/** Signs exactly like a real Edge: the secret derives from the installation key. */
async function signedEdgeRequest(installationKey: string, body: string) {
  const [auth, identity, shared] = await Promise.all([
    import("./runtime-auth"),
    import("@/lib/hermes/relay-identity"),
    import("@hermes-console/shared/gateway"),
  ]);
  const requestUri = "/api/runtime/work/claim";
  const timestamp = Date.now();
  const nonce = randomBytes(16).toString("hex");
  return new Request(`https://console.hermes.local${requestUri}`, {
    method: "POST",
    headers: {
      [shared.GATEWAY_SERVICE_HEADERS.installation]: installationKey,
      [shared.GATEWAY_SERVICE_HEADERS.profile]: "default",
      [shared.GATEWAY_SERVICE_HEADERS.nonce]: nonce,
      [shared.GATEWAY_SERVICE_HEADERS.timestamp]: String(timestamp),
      [shared.GATEWAY_SERVICE_HEADERS.signature]: auth.runtimeRequestSignature({
        secret: identity.deriveInstallationSecret("service", installationKey),
        method: "POST",
        requestUri,
        timestamp,
        nonce,
        profile: "default",
        body,
      }),
    },
    body,
  });
}

async function expectRejected(request: Request, body: string, installationId: string | null) {
  const auth = await import("./runtime-auth");
  let failure: unknown;
  try {
    await auth.verifyRuntimeWorkRequest(request, body, installationId);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(auth.RuntimeAuthError);
  expect((failure as { status?: number }).status).toBe(401);
}

describe("Edge runtime authentication tenant boundary", () => {
  databaseTest("refuses a request that does not name its installation", async () => {
    const [{ db }, schema] = await Promise.all([import("@/db"), import("@/db/schema")]);
    const suffix = randomUUID().slice(0, 8);
    const installationKey = `edge-${suffix}`;
    const owner = await seedTenant(`solo-${suffix}`);
    try {
      await db
        .insert(schema.runtimeInstallations)
        .values(installationValues(owner.tenant.id, owner.user.id, installationKey));
      const body = JSON.stringify({ edgeId: `edge-${suffix}`, capacity: 1 });
      // A perfectly valid signature is not enough: resolving by key alone is what
      // allowed one Edge to be served on behalf of another tenant's installation.
      await expectRejected(await signedEdgeRequest(installationKey, body), body, null);
    } finally {
      await cleanup(installationKey, [owner]);
    }
  });

  databaseTest("refuses a key that does not belong to the named installation", async () => {
    const [{ db }, schema] = await Promise.all([import("@/db"), import("@/db/schema")]);
    const suffix = randomUUID().slice(0, 8);
    const sharedKey = `shared-${suffix}`;
    const a = await seedTenant(`a-${suffix}`);
    const b = await seedTenant(`b-${suffix}`);
    try {
      // Legacy rows may still share a key (the default install gave every tenant
      // `local-default`), so the key must be checked against the named row.
      await db
        .insert(schema.runtimeInstallations)
        .values(installationValues(a.tenant.id, a.user.id, sharedKey));
      const [victim] = await db
        .insert(schema.runtimeInstallations)
        .values(installationValues(b.tenant.id, b.user.id, `${sharedKey}-b`))
        .returning();

      const body = JSON.stringify({ edgeId: `edge-${suffix}`, capacity: 1 });
      // Tenant A signs with its own key but names tenant B's installation.
      await expectRejected(await signedEdgeRequest(sharedKey, body), body, victim.id);
    } finally {
      const { like } = await import("drizzle-orm");
      const [{ db: database }, schema2] = await Promise.all([import("@/db"), import("@/db/schema")]);
      await database
        .delete(schema2.runtimeInstallations)
        .where(like(schema2.runtimeInstallations.installationKey, `${sharedKey}%`));
      await cleanup(null, [a, b]);
    }
  });

  databaseTest("refuses an archived installation", async () => {
    const [{ db }, schema] = await Promise.all([import("@/db"), import("@/db/schema")]);
    const suffix = randomUUID().slice(0, 8);
    const installationKey = `edge-${suffix}`;
    const owner = await seedTenant(`archived-${suffix}`);
    try {
      const [installation] = await db
        .insert(schema.runtimeInstallations)
        .values({
          ...installationValues(owner.tenant.id, owner.user.id, installationKey),
          archivedAt: new Date(),
        })
        .returning();
      const body = JSON.stringify({ edgeId: `edge-${suffix}`, capacity: 1 });
      await expectRejected(await signedEdgeRequest(installationKey, body), body, installation.id);
    } finally {
      await cleanup(installationKey, [owner]);
    }
  });

  databaseTest("resolves a signed Edge request to its own installation", async () => {
    const [{ db }, schema, auth] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("./runtime-auth"),
    ]);
    const suffix = randomUUID().slice(0, 8);
    const installationKey = `edge-${suffix}`;
    const owner = await seedTenant(`ok-${suffix}`);
    try {
      const [installation] = await db
        .insert(schema.runtimeInstallations)
        .values(installationValues(owner.tenant.id, owner.user.id, installationKey))
        .returning();
      const body = JSON.stringify({ edgeId: `edge-${suffix}`, capacity: 1 });
      const verified = await auth.verifyRuntimeWorkRequest(
        await signedEdgeRequest(installationKey, body),
        body,
        installation.id,
      );
      expect(verified.installation.id).toBe(installation.id);
      expect(verified.installation.tenantId).toBe(owner.tenant.id);
      // No plural surface: a request can never fan out across installations.
      expect("installations" in verified).toBe(false);
    } finally {
      await cleanup(installationKey, [owner]);
    }
  });
});

async function cleanup(
  installationKey: string | null,
  owners: Array<{ tenant: { id: string }; user: { id: string } }>,
) {
  const [{ db }, schema, { eq, inArray }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  if (installationKey) {
    await db
      .delete(schema.runtimeInstallations)
      .where(eq(schema.runtimeInstallations.installationKey, installationKey));
  }
  await db
    .delete(schema.tenants)
    .where(inArray(schema.tenants.id, owners.map((owner) => owner.tenant.id)));
  await db
    .delete(schema.users)
    .where(inArray(schema.users.id, owners.map((owner) => owner.user.id)));
}
