// Pas de `server-only` ici, volontairement : ce résolveur est aussi la source de
// vérité des scripts de maintenance (scripts/maintain-runtime-backups.ts), qui
// tournent hors de Next et pour lesquels ce paquet n'est pas résolvable. Le module
// reste inutilisable côté client de fait — il ouvre une connexion Postgres.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { runtimeInstallationSecrets, runtimeInstallations } from "@/db/schema";
import {
  deriveInstallationSecret,
  gatewayServiceMasterSecret,
  gatewayTicketMasterSecret,
} from "@/lib/hermes/relay-identity";
import { openSecret } from "@/lib/hermes/secret-vault";

// Résolution du secret HMAC partagé avec un Edge : la base d'abord, la dérivation
// depuis le master d'environnement en repli.
//
// Le repli n'est pas une commodité, c'est le mécanisme d'adoption : une installation
// antérieure à cette table n'a pas de ligne, elle continue donc de fonctionner à
// l'octet près comme avant. C'est aussi pourquoi on ne pré-remplit jamais la table
// pour une installation existante (voir le commentaire du schéma).

export type SecretPurpose = "service" | "ticket";

/**
 * Un Edge qui redémarre juste après une rotation présente encore l'ancien secret.
 * On accepte donc la génération précédente pendant cette fenêtre, en VÉRIFICATION
 * seulement — jamais pour signer.
 */
const GRACE_WINDOW_MS = 10 * 60 * 1000;
const CACHE_TTL_MS = 15_000;

type ResolvedSecrets = { service: string[]; ticket: string[]; expiresAt: number };

const cache = new Map<string, ResolvedSecrets>();

/** À appeler après tout enrôlement, rotation ou révocation. */
export function invalidateInstallationSecrets(installationKey: string) {
  cache.delete(installationKey);
}

/** Vide le cache entier. Réservé aux tests. */
export function resetInstallationSecretsCache() {
  cache.clear();
}

/**
 * Secret d'une installation qui n'en possède pas en propre. Exporté pour que le test
 * puisse prouver, sans base, qu'il reste identique à l'octet près au comportement
 * d'avant cette table — c'est la garantie qui permet d'adopter le changement sans
 * reprise de données.
 */
export function derivedFallback(purpose: SecretPurpose, installationKey: string) {
  if (process.env.HERMES_GATEWAY_DERIVE_SECRETS !== "false") {
    return deriveInstallationSecret(purpose, installationKey);
  }
  return purpose === "service" ? gatewayServiceMasterSecret() : gatewayTicketMasterSecret();
}

async function load(installationKey: string): Promise<ResolvedSecrets> {
  const cached = cache.get(installationKey);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const rows = await db
    .select({
      installationId: runtimeInstallationSecrets.installationId,
      serviceSecret: runtimeInstallationSecrets.serviceSecret,
      ticketSecret: runtimeInstallationSecrets.ticketSecret,
      status: runtimeInstallationSecrets.status,
      supersededAt: runtimeInstallationSecrets.supersededAt,
    })
    .from(runtimeInstallationSecrets)
    .innerJoin(
      runtimeInstallations,
      eq(runtimeInstallations.id, runtimeInstallationSecrets.installationId),
    )
    .where(
      and(
        eq(runtimeInstallations.installationKey, installationKey),
        inArray(runtimeInstallationSecrets.status, ["active", "superseded"]),
      ),
    );

  const now = Date.now();
  // La génération active d'abord : c'est elle qui sert à signer.
  const usable = rows
    .filter((row) =>
      row.status === "active"
      || (row.supersededAt !== null && now - row.supersededAt.getTime() < GRACE_WINDOW_MS))
    .sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : 0));

  const resolved: ResolvedSecrets = usable.length
    ? {
      // Un déchiffrement raté remonte : retomber en silence sur la dérivation
      // transformerait une clé mal configurée en perte de confidentialité invisible.
      service: usable.map((row) => openSecret(row.serviceSecret, context(row.installationId))),
      ticket: usable.map((row) => openSecret(row.ticketSecret, context(row.installationId))),
      expiresAt: now + CACHE_TTL_MS,
    }
    : {
      service: [derivedFallback("service", installationKey)],
      ticket: [derivedFallback("ticket", installationKey)],
      expiresAt: now + CACHE_TTL_MS,
    };

  cache.set(installationKey, resolved);
  return resolved;
}

/** Contexte de chiffrement d'une ligne : lie le chiffré à son installation. */
export function context(installationId: string) {
  return `installation:${installationId}`;
}

/** Le secret courant, pour signer. Jamais une génération périmée. */
export async function resolveInstallationSecret(
  purpose: SecretPurpose,
  installationKey: string,
) {
  const resolved = await load(installationKey);
  return resolved[purpose][0];
}

/**
 * Les secrets acceptables pour VÉRIFIER une requête entrante : la génération courante,
 * plus la précédente tant qu'elle est dans la fenêtre de grâce.
 */
export async function resolveVerificationSecrets(
  purpose: SecretPurpose,
  installationKey: string,
) {
  const resolved = await load(installationKey);
  return resolved[purpose];
}
