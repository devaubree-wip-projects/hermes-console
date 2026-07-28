import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

async function seedInstallation(suffix: string) {
  const [{ db }, schema] = await Promise.all([import("@/db"), import("@/db/schema")]);
  const [user] = await db.insert(schema.users).values({
    email: `installation-secrets-${suffix}@hermes.local`,
    passwordHash: "integration-test-only",
    name: `Secrets ${suffix}`,
  }).returning();
  const [tenant] = await db.insert(schema.tenants).values({
    name: `Secrets ${suffix}`,
    slug: `secrets-${suffix}`,
    ownerUserId: user.id,
  }).returning();
  const [installation] = await db.insert(schema.runtimeInstallations).values({
    tenantId: tenant.id,
    name: `Edge ${suffix}`,
    installationKey: `secrets-${suffix}`,
    origin: "remote_existing",
    managementLevel: "external",
    transport: "direct",
    gatewayUrl: "http://127.0.0.1:8787",
    createdByUserId: user.id,
  }).returning();
  return { db, schema, installation, tenantId: tenant.id, userId: user.id };
}

async function cleanup(suffix: string) {
  const [{ db }, schema] = await Promise.all([import("@/db"), import("@/db/schema")]);
  const { eq } = await import("drizzle-orm");
  await db.delete(schema.tenants).where(eq(schema.tenants.slug, `secrets-${suffix}`));
  await db.delete(schema.users)
    .where(eq(schema.users.email, `installation-secrets-${suffix}@hermes.local`));
}

const suffixes: string[] = [];

afterEach(async () => {
  const { resetInstallationSecretsCache } = await import("./installation-secrets");
  resetInstallationSecretsCache();
  while (suffixes.length) await cleanup(suffixes.pop()!);
});

function track(suffix: string) {
  suffixes.push(suffix);
  return suffix;
}

describe("Résolution des secrets d’installation", () => {
  databaseTest("préfère le secret stocké à la dérivation", async () => {
    const suffix = track(randomUUID().slice(0, 8));
    const { db, schema, installation } = await seedInstallation(suffix);
    const { context, resolveInstallationSecret } = await import("./installation-secrets");
    const { sealSecret } = await import("./secret-vault");
    const { deriveInstallationSecret } = await import("./relay-identity");

    await db.insert(schema.runtimeInstallationSecrets).values({
      installationId: installation.id,
      serviceSecret: sealSecret("secret-de-service-stocke", context(installation.id)),
      ticketSecret: sealSecret("secret-de-ticket-stocke", context(installation.id)),
    });

    expect(await resolveInstallationSecret("service", installation.installationKey))
      .toBe("secret-de-service-stocke");
    expect(await resolveInstallationSecret("ticket", installation.installationKey))
      .toBe("secret-de-ticket-stocke");
    expect(await resolveInstallationSecret("service", installation.installationKey))
      .not.toBe(deriveInstallationSecret("service", installation.installationKey));
  });

  databaseTest("retombe sur la dérivation quand aucune ligne n’existe", async () => {
    const suffix = track(randomUUID().slice(0, 8));
    const { installation } = await seedInstallation(suffix);
    const { resolveInstallationSecret } = await import("./installation-secrets");
    const { deriveInstallationSecret } = await import("./relay-identity");

    expect(await resolveInstallationSecret("service", installation.installationKey))
      .toBe(deriveInstallationSecret("service", installation.installationKey));
  });

  databaseTest("accepte la génération précédente pendant la fenêtre de grâce", async () => {
    const suffix = track(randomUUID().slice(0, 8));
    const { db, schema, installation } = await seedInstallation(suffix);
    const { context, resolveInstallationSecret, resolveVerificationSecrets } =
      await import("./installation-secrets");
    const { sealSecret } = await import("./secret-vault");

    await db.insert(schema.runtimeInstallationSecrets).values([
      {
        installationId: installation.id,
        serviceSecret: sealSecret("ancien", context(installation.id)),
        ticketSecret: sealSecret("ancien-ticket", context(installation.id)),
        status: "superseded",
        supersededAt: new Date(),
      },
      {
        installationId: installation.id,
        serviceSecret: sealSecret("courant", context(installation.id)),
        ticketSecret: sealSecret("courant-ticket", context(installation.id)),
      },
    ]);

    // On signe toujours avec la génération courante…
    expect(await resolveInstallationSecret("service", installation.installationKey))
      .toBe("courant");
    // …mais on accepte encore l’ancienne, le temps qu’un Edge redémarre.
    const acceptable = await resolveVerificationSecrets("service", installation.installationKey);
    expect(acceptable).toEqual(["courant", "ancien"]);
  });

  databaseTest("ignore une génération périmée hors fenêtre de grâce", async () => {
    const suffix = track(randomUUID().slice(0, 8));
    const { db, schema, installation } = await seedInstallation(suffix);
    const { context, resolveVerificationSecrets } = await import("./installation-secrets");
    const { sealSecret } = await import("./secret-vault");

    await db.insert(schema.runtimeInstallationSecrets).values([
      {
        installationId: installation.id,
        serviceSecret: sealSecret("trop-vieux", context(installation.id)),
        ticketSecret: sealSecret("trop-vieux-ticket", context(installation.id)),
        status: "superseded",
        supersededAt: new Date(Date.now() - 11 * 60 * 1000),
      },
      {
        installationId: installation.id,
        serviceSecret: sealSecret("courant", context(installation.id)),
        ticketSecret: sealSecret("courant-ticket", context(installation.id)),
      },
    ]);

    expect(await resolveVerificationSecrets("service", installation.installationKey))
      .toEqual(["courant"]);
  });

  databaseTest("cesse de servir un secret révoqué, sans toucher aux autres installations", async () => {
    const suffix = track(randomUUID().slice(0, 8));
    const other = track(randomUUID().slice(0, 8));
    const { db, schema, installation } = await seedInstallation(suffix);
    const { installation: untouched } = await seedInstallation(other);
    const { context, invalidateInstallationSecrets, resolveInstallationSecret } =
      await import("./installation-secrets");
    const { sealSecret } = await import("./secret-vault");
    const { deriveInstallationSecret } = await import("./relay-identity");
    const { and, eq } = await import("drizzle-orm");

    for (const row of [installation, untouched]) {
      await db.insert(schema.runtimeInstallationSecrets).values({
        installationId: row.id,
        serviceSecret: sealSecret(`service-${row.installationKey}`, context(row.id)),
        ticketSecret: sealSecret(`ticket-${row.installationKey}`, context(row.id)),
      });
    }

    // Révocation d'une seule installation, comme le fait la déconnexion.
    await db.update(schema.runtimeInstallationSecrets)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(and(
        eq(schema.runtimeInstallationSecrets.installationId, installation.id),
        eq(schema.runtimeInstallationSecrets.status, "active"),
      ));
    invalidateInstallationSecrets(installation.installationKey);

    // Plus aucun secret propre : on retombe sur la dérivation, que l'Edge refusera.
    expect(await resolveInstallationSecret("service", installation.installationKey))
      .toBe(deriveInstallationSecret("service", installation.installationKey));
    // Et c'est tout l'intérêt : la voisine garde le sien.
    expect(await resolveInstallationSecret("service", untouched.installationKey))
      .toBe(`service-${untouched.installationKey}`);
  });

  databaseTest("lève plutôt que de retomber sur la dérivation si le déchiffrement échoue", async () => {
    const suffix = track(randomUUID().slice(0, 8));
    const { db, schema, installation } = await seedInstallation(suffix);
    const { resolveInstallationSecret } = await import("./installation-secrets");
    const { sealSecret } = await import("./secret-vault");

    // Scellé pour une AUTRE installation : simule une ligne recopiée, ou une clé
    // de chiffrement changée. Un repli silencieux serait ici une perte de
    // confidentialité invisible.
    await db.insert(schema.runtimeInstallationSecrets).values({
      installationId: installation.id,
      serviceSecret: sealSecret("secret", `installation:${randomUUID()}`),
      ticketSecret: sealSecret("secret", `installation:${randomUUID()}`),
    });

    await expect(resolveInstallationSecret("service", installation.installationKey))
      .rejects.toThrow("Déchiffrement impossible");
  });
});
