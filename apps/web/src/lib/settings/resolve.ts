import { db } from "@/db";
import { consoleSettings } from "@/db/schema";
import { openSecret } from "@/lib/hermes/secret-vault";
import { consoleSettingDefinition } from "@/lib/settings/catalog";

// Résolution d'un réglage d'instance : la base d'abord, l'environnement en repli.
//
// Le sens compte. `ensureEnvironmentRuntimeInstallation` (lib/hermes/installations.ts)
// fait l'inverse : il réécrit la valeur de la base depuis l'env à chaque appel, si
// bien qu'une modification faite dans l'interface disparaît au redémarrage. C'est
// précisément le comportement à ne pas reproduire ici.

export type SettingSource = "database" | "environment";
export type ResolvedSetting = {
  key: string;
  value: string | null;
  source: SettingSource;
  isSecret: boolean;
};

const CACHE_TTL_MS = 15_000;

let cache: { entries: Map<string, ResolvedSetting>; expiresAt: number } | null = null;

/** Contexte de chiffrement d'un réglage secret. */
export function settingContext(key: string) {
  return `setting:${key}`;
}

/**
 * Sortie de secours. Une valeur erronée en base peut rendre l'instance muette (SMTP
 * cassé, donc plus de réinitialisation de mot de passe) ; sans une soupape lue dans
 * l'environnement, il faudrait ouvrir psql pour s'en sortir.
 */
export function overridesDisabled() {
  return process.env.HERMES_SETTINGS_DISABLE_OVERRIDES === "true";
}

export function invalidateSettings() {
  cache = null;
}

function fromEnvironment(key: string): ResolvedSetting {
  const raw = process.env[key];
  return {
    key,
    value: raw?.trim() ? raw : null,
    source: "environment",
    isSecret: consoleSettingDefinition(key)?.secret ?? false,
  };
}

async function load() {
  if (cache && cache.expiresAt > Date.now()) return cache.entries;
  const rows = await db.select().from(consoleSettings);
  const entries = new Map<string, ResolvedSetting>();
  for (const row of rows) {
    // Un réglage retiré du catalogue ne doit plus être servi, même si sa ligne
    // subsiste : le catalogue est la frontière de ce qui est surchargeable.
    if (!consoleSettingDefinition(row.key)) continue;
    entries.set(row.key, {
      key: row.key,
      // Un déchiffrement raté remonte, comme pour les secrets d'installation : un
      // repli silencieux sur l'environnement masquerait une clé mal configurée.
      value: row.isSecret
        ? (row.valueEncrypted ? openSecret(row.valueEncrypted, settingContext(row.key)) : null)
        : row.value,
      source: "database",
      isSecret: row.isSecret,
    });
  }
  cache = { entries, expiresAt: Date.now() + CACHE_TTL_MS };
  return entries;
}

/** Valeur effective d'un réglage, base d'abord. */
export async function resolveSetting(key: string): Promise<ResolvedSetting> {
  if (overridesDisabled()) return fromEnvironment(key);
  const entries = await load();
  return entries.get(key) ?? fromEnvironment(key);
}

/** Valeur seule, pour les appelants qui se moquent de la provenance. */
export async function settingValue(key: string) {
  return (await resolveSetting(key)).value ?? undefined;
}

/**
 * Toutes les valeurs du catalogue, avec leur provenance. Alimente l'interface, qui
 * doit dire d'où vient chaque valeur — sans quoi « la prod n'utilise pas la valeur du
 * fichier » devient indiagnosticable.
 */
export async function resolveAllSettings(keys: readonly string[]) {
  if (overridesDisabled()) return keys.map(fromEnvironment);
  const entries = await load();
  return keys.map((key) => entries.get(key) ?? fromEnvironment(key));
}
