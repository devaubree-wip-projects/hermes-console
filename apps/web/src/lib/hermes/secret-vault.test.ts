import { afterEach, describe, expect, test } from "bun:test";
import { openSecret, resetSecretVaultKey, sealSecret } from "./secret-vault";

// `NODE_ENV` est typé en lecture seule par la configuration TypeScript de Next.
// Le garde-fou de production en dépend, on y accède donc par cette vue mutable,
// cantonnée au test.
const environment = process.env as Record<string, string | undefined>;

const previousKey = environment.HERMES_INSTALLATION_SECRET_KEY;
const previousNodeEnv = environment.NODE_ENV;

function restoreEnvironment() {
  if (previousKey === undefined) delete environment.HERMES_INSTALLATION_SECRET_KEY;
  else environment.HERMES_INSTALLATION_SECRET_KEY = previousKey;
  if (previousNodeEnv === undefined) delete environment.NODE_ENV;
  else environment.NODE_ENV = previousNodeEnv;
  resetSecretVaultKey();
}

afterEach(restoreEnvironment);

describe("Coffre de secrets", () => {
  test("rend la valeur d’origine pour le même contexte", () => {
    const sealed = sealSecret("s3cr3t-de-service", "installation:abc");
    expect(sealed).not.toContain("s3cr3t-de-service");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(openSecret(sealed, "installation:abc")).toBe("s3cr3t-de-service");
  });

  test("produit un chiffré différent à chaque appel", () => {
    expect(sealSecret("identique", "installation:abc"))
      .not.toBe(sealSecret("identique", "installation:abc"));
  });

  test("refuse d’ouvrir un chiffré déplacé sur un autre contexte", () => {
    const sealed = sealSecret("s3cr3t", "installation:abc");
    expect(() => openSecret(sealed, "installation:def")).toThrow("Déchiffrement impossible");
  });

  test("refuse un chiffré altéré", () => {
    const [version, iv, tag] = sealSecret("s3cr3t", "installation:abc").split(".");
    const tampered = [version, iv, tag, Buffer.from("autre-chose").toString("base64url")].join(".");
    expect(() => openSecret(tampered, "installation:abc")).toThrow("Déchiffrement impossible");
  });

  test("refuse un format ou une version inconnus", () => {
    expect(() => openSecret("pas-un-chiffre", "installation:abc")).toThrow("Format de secret scellé invalide.");
    expect(() => openSecret("v2.a.b.c", "installation:abc")).toThrow("Format de secret scellé invalide.");
  });

  test("exige une clé explicite en production", () => {
    delete environment.HERMES_INSTALLATION_SECRET_KEY;
    environment.NODE_ENV = "production";
    resetSecretVaultKey();
    expect(() => sealSecret("s3cr3t", "installation:abc"))
      .toThrow("HERMES_INSTALLATION_SECRET_KEY doit être défini explicitement en production.");
  });

  test("refuse une clé trop courte", () => {
    process.env.HERMES_INSTALLATION_SECRET_KEY = "trop-court";
    resetSecretVaultKey();
    expect(() => sealSecret("s3cr3t", "installation:abc"))
      .toThrow("HERMES_INSTALLATION_SECRET_KEY doit contenir au moins 32 caractères.");
  });

  test("une clé différente n’ouvre pas un chiffré existant", () => {
    process.env.HERMES_INSTALLATION_SECRET_KEY = "a".repeat(64);
    resetSecretVaultKey();
    const sealed = sealSecret("s3cr3t", "installation:abc");
    process.env.HERMES_INSTALLATION_SECRET_KEY = "b".repeat(64);
    resetSecretVaultKey();
    expect(() => openSecret(sealed, "installation:abc")).toThrow("Déchiffrement impossible");
  });
});
