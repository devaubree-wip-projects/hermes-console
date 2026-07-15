import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const PUBLIC_ENTRIES = [
  "config.yaml",
  "SOUL.md",
  "skills",
  "plugins",
  "sessions",
  "memory",
  "memories",
  "cron",
  "state.db",
  "state.db-wal",
  "state.db-shm",
] as const;
const SECRET_ENTRIES = [".env", "auth.json", "secrets.json"] as const;
const MANIFEST = ".hermes-console-import.json";

export type ProfileImportManifest = {
  version: 1;
  sourceProfile: string;
  targetProfile: string;
  includeSecrets: boolean;
  importedAt: string;
  entries: Array<{ path: string; sha256: string }>;
};

export function validImportProfile(profile: string) {
  return profile === "default" || /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(profile);
}

export function hermesProfilePath(root: string, profile: string) {
  if (!validImportProfile(profile)) throw new Error("Profil Hermes invalide.");
  return profile === "default" ? root : path.join(root, "profiles", profile);
}

async function exists(target: string) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function assertNoSymlinks(target: string) {
  const metadata = await lstat(target);
  if (metadata.isSymbolicLink()) throw new Error(`Import refusé : lien symbolique détecté (${target}).`);
  if (!metadata.isDirectory()) return;
  for (const entry of await readdir(target)) {
    await assertNoSymlinks(path.join(target, entry));
  }
}

async function digest(target: string): Promise<string> {
  const metadata = await lstat(target);
  if (metadata.isSymbolicLink()) throw new Error(`Validation refusée : lien symbolique détecté (${target}).`);
  if (metadata.isFile()) return createHash("sha256").update(await readFile(target)).digest("hex");
  const hash = createHash("sha256");
  for (const entry of (await readdir(target)).sort()) {
    hash.update(entry);
    hash.update(await digest(path.join(target, entry)));
  }
  return hash.digest("hex");
}

export async function importHermesProfile(input: {
  sourceRoot: string;
  targetRoot: string;
  sourceProfile: string;
  targetProfile: string;
  includeSecrets?: boolean;
  now?: Date;
}) {
  if (!validImportProfile(input.sourceProfile) || !validImportProfile(input.targetProfile)) {
    throw new Error("Profil Hermes invalide.");
  }
  if (input.targetProfile === "default") {
    throw new Error("Le profil cible default ne peut pas être remplacé ; choisissez un nouveau profil nommé.");
  }
  const source = path.resolve(hermesProfilePath(input.sourceRoot, input.sourceProfile));
  const target = path.resolve(hermesProfilePath(input.targetRoot, input.targetProfile));
  const profilesRoot = path.resolve(input.targetRoot, "profiles");
  if (target === source || !target.startsWith(`${profilesRoot}${path.sep}`)) {
    throw new Error("Chemin cible d’import invalide.");
  }
  if (!(await exists(source))) throw new Error("Le profil source Hermes n’existe pas.");
  if (await exists(target)) throw new Error("Le profil cible existe déjà ; aucun écrasement implicite n’est autorisé.");

  const selected = [
    ...PUBLIC_ENTRIES,
    ...(input.includeSecrets ? SECRET_ENTRIES : []),
  ];
  const available: string[] = [];
  for (const entry of selected) {
    const sourceEntry = path.join(source, entry);
    if (await exists(sourceEntry)) {
      await assertNoSymlinks(sourceEntry);
      available.push(entry);
    }
  }
  if (!available.length) throw new Error("Aucune donnée Hermes importable n’a été trouvée.");

  await mkdir(profilesRoot, { recursive: true, mode: 0o700 });
  const temporary = `${target}.importing-${process.pid}-${Date.now()}`;
  await mkdir(temporary, { mode: 0o700 });
  try {
    for (const entry of available) {
      await cp(path.join(source, entry), path.join(temporary, entry), {
        recursive: true,
        force: false,
        errorOnExist: true,
        dereference: false,
        preserveTimestamps: true,
      });
    }
    const manifest: ProfileImportManifest = {
      version: 1,
      sourceProfile: input.sourceProfile,
      targetProfile: input.targetProfile,
      includeSecrets: input.includeSecrets === true,
      importedAt: (input.now ?? new Date()).toISOString(),
      entries: await Promise.all(available.map(async (entry) => ({
        path: entry,
        sha256: await digest(path.join(temporary, entry)),
      }))),
    };
    await writeFile(path.join(temporary, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, target);
    return { target, manifest };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyHermesProfileImport(targetRoot: string, targetProfile: string) {
  const target = hermesProfilePath(targetRoot, targetProfile);
  const manifest = JSON.parse(await readFile(path.join(target, MANIFEST), "utf8")) as ProfileImportManifest;
  if (
    manifest.version !== 1
    || manifest.targetProfile !== targetProfile
    || !Array.isArray(manifest.entries)
    || manifest.entries.some((entry) =>
      typeof entry?.path !== "string"
      || ![...PUBLIC_ENTRIES, ...SECRET_ENTRIES].includes(entry.path as never)
      || typeof entry.sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
  ) {
    throw new Error("Manifeste d’import invalide.");
  }
  for (const entry of manifest.entries) {
    if (await digest(path.join(target, entry.path)) !== entry.sha256) {
      throw new Error(`Contrôle d’intégrité échoué pour ${entry.path}.`);
    }
  }
  return manifest;
}

export async function rollbackHermesProfileImport(targetRoot: string, targetProfile: string) {
  if (targetProfile === "default") throw new Error("Rollback du profil default interdit.");
  const target = hermesProfilePath(targetRoot, targetProfile);
  await verifyHermesProfileImport(targetRoot, targetProfile);
  await rm(target, { recursive: true, force: false });
  return { removed: target };
}
