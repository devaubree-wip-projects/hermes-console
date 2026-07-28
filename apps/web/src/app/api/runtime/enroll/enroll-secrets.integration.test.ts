import { afterEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";

// Comme runtime-auth.integration.test.ts : la route tire `relay-admin`, marqué
// server-only, un paquet que Next fournit mais que bun ne résout pas. Tous les
// imports du sujet sont donc dynamiques, après ce mock.
mock.module("server-only", () => ({}));

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

const slugs: string[] = [];

async function seedPendingEnrollment(suffix: string, transport: "relay" | "direct" = "relay") {
  const [{ db }, schema, { createEnrollmentToken, hashEnrollmentToken }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("@/lib/hermes/relay-identity"),
  ]);
  const [user] = await db.insert(schema.users).values({
    email: `enroll-secrets-${suffix}@hermes.local`,
    passwordHash: "integration-test-only",
    name: `Enroll ${suffix}`,
  }).returning();
  const [tenant] = await db.insert(schema.tenants).values({
    name: `Enroll ${suffix}`,
    slug: `enroll-${suffix}`,
    ownerUserId: user.id,
  }).returning();
  const [installation] = await db.insert(schema.runtimeInstallations).values({
    tenantId: tenant.id,
    name: `Edge ${suffix}`,
    installationKey: `enroll-${suffix}`,
    origin: "remote_existing",
    managementLevel: "external",
    transport,
    gatewayUrl: transport === "relay"
      ? `relay://enroll-${suffix}`
      : "https://edge.example.test",
    status: "pending_enrollment",
    createdByUserId: user.id,
  }).returning();
  const token = createEnrollmentToken();
  await db.insert(schema.runtimeEnrollmentTokens).values({
    installationId: installation.id,
    tokenHash: hashEnrollmentToken(token),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    createdByUserId: user.id,
  });
  slugs.push(suffix);
  return { db, schema, installation, token, email: `enroll-secrets-${suffix}@hermes.local` };
}

afterEach(async () => {
  const [{ db }, schema, { eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  const { resetInstallationSecretsCache } = await import("@/lib/hermes/installation-secrets");
  resetInstallationSecretsCache();
  while (slugs.length) {
    const suffix = slugs.pop()!;
    await db.delete(schema.tenants).where(eq(schema.tenants.slug, `enroll-${suffix}`));
    await db.delete(schema.users)
      .where(eq(schema.users.email, `enroll-secrets-${suffix}@hermes.local`));
  }
});

// Certificat client auto-signé, comme celui que `hermes-gateway enroll` produit.
async function edgeCertificate() {
  const { generateKeyPairSync, X509Certificate } = await import("node:crypto");
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "edge-cert-"));
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  writeFileSync(join(dir, "key.pem"), privateKey.export({ type: "pkcs8", format: "pem" }) as string);
  execFileSync("openssl", [
    "req", "-new", "-x509", "-key", join(dir, "key.pem"),
    "-out", join(dir, "cert.pem"), "-days", "31", "-subj", "/CN=hermes-edge",
  ]);
  const pem = readFileSync(join(dir, "cert.pem"), "utf8");
  new X509Certificate(pem);
  return pem;
}

describe("Échange d’enrôlement", () => {
  databaseTest("remet des secrets aléatoires, pas les secrets dérivés", async () => {
    const suffix = randomUUID().slice(0, 8);
    const { db, schema, installation, token } = await seedPendingEnrollment(suffix);
    const { POST } = await import("./route");
    const { deriveInstallationSecret } = await import("@/lib/hermes/relay-identity");
    const { eq } = await import("drizzle-orm");

    const response = await POST(new Request("http://console.local/api/runtime/enroll", {
      method: "POST",
      body: JSON.stringify({ token, certificatePem: await edgeCertificate() }),
    }));
    expect(response.status).toBe(200);
    const payload = await response.json() as { serviceSecret: string; ticketSecret: string };

    // Le cœur du changement : la Console ne peut plus recalculer ce secret.
    expect(payload.serviceSecret)
      .not.toBe(deriveInstallationSecret("service", installation.installationKey));
    // Confondre les deux ferait passer les requêtes signées et échouer tous les WS.
    expect(payload.serviceSecret).not.toBe(payload.ticketSecret);
    expect(payload.serviceSecret.length).toBeGreaterThanOrEqual(24);
    expect(payload.ticketSecret.length).toBeGreaterThanOrEqual(24);

    const rows = await db.select().from(schema.runtimeInstallationSecrets)
      .where(eq(schema.runtimeInstallationSecrets.installationId, installation.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("active");
    // Jamais en clair en base.
    expect(rows[0].serviceSecret).not.toBe(payload.serviceSecret);
    expect(rows[0].serviceSecret.startsWith("v1.")).toBe(true);
  });

  databaseTest("en transport direct, n’écrase pas l’URL et n’annonce aucun Relay", async () => {
    const suffix = randomUUID().slice(0, 8);
    const { db, schema, installation, token } = await seedPendingEnrollment(suffix, "direct");
    const { POST } = await import("./route");
    const { eq } = await import("drizzle-orm");

    const response = await POST(new Request("http://console.local/api/runtime/enroll", {
      method: "POST",
      body: JSON.stringify({ token, certificatePem: await edgeCertificate() }),
    }));
    expect(response.status).toBe(200);
    const payload = await response.json() as Record<string, unknown>;

    // L'Edge refuse un relayUrl sans credential, et n'a rien à composer ici.
    expect(payload.relayUrl).toBeUndefined();
    expect(payload.credential).toBeUndefined();
    expect(payload.serviceSecret).toBeTruthy();

    const [row] = await db.select().from(schema.runtimeInstallations)
      .where(eq(schema.runtimeInstallations.id, installation.id));
    // Le cœur du cas direct : écraser cette URL rendrait l'installation injoignable.
    expect(row.gatewayUrl).toBe("https://edge.example.test");
    expect(row.transport).toBe("direct");
    expect(row.statusReason).toBe("direct_probe_pending");
  });

  databaseTest("le résolveur rend immédiatement le secret remis à l’Edge", async () => {
    const suffix = randomUUID().slice(0, 8);
    const { installation, token } = await seedPendingEnrollment(suffix);
    const { POST } = await import("./route");
    const { resolveInstallationSecret } = await import("@/lib/hermes/installation-secrets");

    const response = await POST(new Request("http://console.local/api/runtime/enroll", {
      method: "POST",
      body: JSON.stringify({ token, certificatePem: await edgeCertificate() }),
    }));
    const payload = await response.json() as { serviceSecret: string; ticketSecret: string };

    // Sans purge du cache, la Console signerait encore avec la génération d’avant.
    expect(await resolveInstallationSecret("service", installation.installationKey))
      .toBe(payload.serviceSecret);
    expect(await resolveInstallationSecret("ticket", installation.installationKey))
      .toBe(payload.ticketSecret);
  });
});
