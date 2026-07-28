import { afterEach, describe, expect, test } from "bun:test";

const databaseTest = process.env.DATABASE_URL ? test : test.skip;
const environment = process.env as Record<string, string | undefined>;

afterEach(async () => {
  const [{ db }, schema, { eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  await db.delete(schema.consoleSettings).where(eq(schema.consoleSettings.key, "SMTP_HOST"));
  await db.delete(schema.consoleSettings).where(eq(schema.consoleSettings.key, "SMTP_PASSWORD"));
  delete environment.HERMES_SETTINGS_DISABLE_OVERRIDES;
  delete environment.SMTP_HOST;
  const { invalidateSettings } = await import("./resolve");
  invalidateSettings();
});

describe("Réglages d’instance", () => {
  databaseTest("la base prime sur l’environnement", async () => {
    const [{ db }, schema] = await Promise.all([import("@/db"), import("@/db/schema")]);
    const { invalidateSettings, resolveSetting } = await import("./resolve");
    environment.SMTP_HOST = "depuis-le-fichier";
    invalidateSettings();

    expect(await resolveSetting("SMTP_HOST")).toMatchObject({
      value: "depuis-le-fichier",
      source: "environment",
    });

    await db.insert(schema.consoleSettings).values({ key: "SMTP_HOST", value: "depuis-la-console" });
    invalidateSettings();

    // Le sens qui compte : ce que l'Owner a saisi gagne, et ne sera pas réécrit par
    // l'environnement au prochain démarrage.
    expect(await resolveSetting("SMTP_HOST")).toMatchObject({
      value: "depuis-la-console",
      source: "database",
    });
  });

  databaseTest("retirer la ligne rend la main au fichier", async () => {
    const [{ db }, schema, { eq }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    const { invalidateSettings, resolveSetting } = await import("./resolve");
    environment.SMTP_HOST = "depuis-le-fichier";
    await db.insert(schema.consoleSettings).values({ key: "SMTP_HOST", value: "depuis-la-console" });
    invalidateSettings();
    await db.delete(schema.consoleSettings).where(eq(schema.consoleSettings.key, "SMTP_HOST"));
    invalidateSettings();

    expect(await resolveSetting("SMTP_HOST")).toMatchObject({
      value: "depuis-le-fichier",
      source: "environment",
    });
  });

  databaseTest("la soupape ignore toute surcharge", async () => {
    const [{ db }, schema] = await Promise.all([import("@/db"), import("@/db/schema")]);
    const { invalidateSettings, resolveSetting } = await import("./resolve");
    environment.SMTP_HOST = "depuis-le-fichier";
    await db.insert(schema.consoleSettings).values({ key: "SMTP_HOST", value: "depuis-la-console" });
    invalidateSettings();

    // Sans cette sortie, un SMTP mal saisi coupe les emails de réinitialisation et
    // il n'y a plus qu'un accès psql pour s'en sortir.
    environment.HERMES_SETTINGS_DISABLE_OVERRIDES = "true";
    expect(await resolveSetting("SMTP_HOST")).toMatchObject({
      value: "depuis-le-fichier",
      source: "environment",
    });
  });

  databaseTest("un réglage secret est chiffré en base et relu en clair", async () => {
    const [{ db }, schema] = await Promise.all([import("@/db"), import("@/db/schema")]);
    const { invalidateSettings, resolveSetting, settingContext } = await import("./resolve");
    const { sealSecret } = await import("@/lib/hermes/secret-vault");

    await db.insert(schema.consoleSettings).values({
      key: "SMTP_PASSWORD",
      valueEncrypted: sealSecret("mot-de-passe-relais", settingContext("SMTP_PASSWORD")),
      isSecret: true,
    });
    invalidateSettings();

    expect(await resolveSetting("SMTP_PASSWORD")).toMatchObject({
      value: "mot-de-passe-relais",
      source: "database",
      isSecret: true,
    });

    const [row] = await db.select().from(schema.consoleSettings);
    expect(row.value).toBeNull();
    expect(row.valueEncrypted).not.toContain("mot-de-passe-relais");
  });

  databaseTest("ignore une ligne dont la clé n’est plus au catalogue", async () => {
    const [{ db }, schema] = await Promise.all([import("@/db"), import("@/db/schema")]);
    const { invalidateSettings, resolveSetting } = await import("./resolve");
    await db.insert(schema.consoleSettings).values({ key: "DATABASE_URL", value: "postgres://pirate" });
    invalidateSettings();
    try {
      // Le catalogue est la frontière du surchargeable : une ligne posée hors de lui
      // ne doit jamais être servie, sous peine de rendre surchargeable une variable
      // d'amorçage ou une racine de confiance.
      expect(await resolveSetting("DATABASE_URL")).toMatchObject({ source: "environment" });
    } finally {
      const { eq } = await import("drizzle-orm");
      await db.delete(schema.consoleSettings).where(eq(schema.consoleSettings.key, "DATABASE_URL"));
      invalidateSettings();
    }
  });
});
