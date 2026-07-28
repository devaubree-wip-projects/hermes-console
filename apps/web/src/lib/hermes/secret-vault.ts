import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { gatewayServiceMasterSecret } from "@/lib/hermes/relay-identity";

// Chiffrement au repos des secrets que la Console détient pour le compte d'un tiers
// (secrets de service/ticket d'une installation, réglages secrets). Le modèle est
// celui déjà retenu côté Go pour les sauvegardes — apps/gateway/gateway/backup.go:97-102 :
// AES-256-GCM, clé dérivée par hachage du secret configuré, et un contexte passé en
// données additionnelles pour qu'un chiffré ne puisse pas être déplacé d'un champ à
// l'autre.
//
// La clé de chiffrement ne peut pas vivre en base : elle protège précisément ce que
// la base contient. Elle reste donc une variable d'environnement, et sa perte impose
// de ré-enrôler les Edge concernés.

const VERSION = "v1";
const IV_BYTES = 12;
const MINIMUM_KEY_LENGTH = 32;
const KEK_INFO = "hermes-console:installation-secret-kek";

let cachedKey: Buffer | null = null;

// Hachage plutôt qu'usage direct : la variable est écrite par `openssl rand -hex 32`,
// sa longueur en octets n'est donc pas celle attendue par AES-256. Un KDF lent
// (scrypt, argon2) ne servirait à rien ici — il protège des secrets à faible entropie,
// pas une valeur aléatoire de 32 octets, et il coûterait le même prix à chaque
// démarrage de process. C'est le choix déjà fait côté Go pour les sauvegardes
// (apps/gateway/gateway/backup.go:97-99), avec la même garde de longueur minimale.
function keyFrom(material: string) {
  return createHash("sha256").update(`${KEK_INFO}:${material}`).digest();
}

function encryptionKey() {
  if (cachedKey) return cachedKey;
  const configured = process.env.HERMES_INSTALLATION_SECRET_KEY?.trim();
  if (configured) {
    if (configured.length < MINIMUM_KEY_LENGTH) {
      throw new Error("HERMES_INSTALLATION_SECRET_KEY doit contenir au moins 32 caractères.");
    }
    cachedKey = keyFrom(configured);
    return cachedKey;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("HERMES_INSTALLATION_SECRET_KEY doit être défini explicitement en production.");
  }
  // Dev et CI : dériver du master de service évite d'imposer une variable de plus
  // dans chaque .env local et dans les workflows. Refusé en production ci-dessus.
  cachedKey = keyFrom(gatewayServiceMasterSecret());
  return cachedKey;
}

/** Réinitialise la clé mémorisée. Réservé aux tests, qui changent l'environnement. */
export function resetSecretVaultKey() {
  cachedKey = null;
}

/**
 * Chiffre une valeur pour un contexte donné. Le contexte (par exemple
 * `installation:<uuid>` ou `setting:SMTP_PASSWORD`) entre dans les données
 * additionnelles : un chiffré recopié sur une autre ligne ne s'ouvrira pas.
 */
export function sealSecret(plaintext: string, context: string) {
  if (!context.trim()) throw new Error("Le contexte de chiffrement est obligatoire.");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Ouvre une valeur scellée. Lève si le format, la version, le contexte ou la clé ne
 * correspondent pas — jamais de valeur de repli : un échec silencieux transformerait
 * une clé mal configurée en perte de confidentialité invisible.
 */
export function openSecret(sealed: string, context: string) {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Format de secret scellé invalide.");
  }
  const [, iv, tag, ciphertext] = parts;
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Le message ne distingue pas mauvaise clé, mauvais contexte et altération :
    // toute distinction serait un oracle pour qui obtient un accès en lecture.
    throw new Error("Déchiffrement impossible : clé, contexte ou intégrité invalides.");
  }
}
