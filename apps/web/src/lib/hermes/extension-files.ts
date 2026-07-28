import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const HERMES_CONSOLE_CONTROL_PLUGIN = "hermes-console-control";
const EXTENSION_FILES = ["plugin.yaml", "__init__.py"] as const;

function extensionSourceRoot() {
  const appLocal = path.join(process.cwd(), "hermes-extensions", HERMES_CONSOLE_CONTROL_PLUGIN);
  return existsSync(appLocal)
    ? appLocal
    : path.join(process.cwd(), "apps", "web", "hermes-extensions", HERMES_CONSOLE_CONTROL_PLUGIN);
}

export function validHermesProfileName(profile: string) {
  return profile === "default" || /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(profile);
}

export function hermesProfileHome(profile: string, hermesRoot?: string) {
  if (!validHermesProfileName(profile)) throw new Error("Profil Hermes invalide.");
  const root = hermesRoot?.trim() || process.env.HERMES_HOME?.trim() || path.join(homedir(), ".hermes");
  return profile === "default" ? root : path.join(root, "profiles", profile);
}

export async function syncHermesConsoleControlExtension(input: {
  profile: string;
  hermesRoot?: string;
}) {
  const profileHome = hermesProfileHome(input.profile, input.hermesRoot);
  // The runtime owns profile creation; we only ever add files to a profile it
  // already made. Without this guard a wrong `HERMES_HOME` — an unset variable,
  // a missing volume — makes `mkdir -p` build a plausible tree nobody reads, and
  // the sync reports success while Telegram silently keeps the old commands.
  if (!existsSync(profileHome)) {
    throw new Error(
      `Profil Hermes introuvable sur le disque : ${profileHome}. `
      + "Le service doit voir le HERMES_HOME du runtime pour y installer l’extension.",
    );
  }
  const targetRoot = path.join(profileHome, "plugins", HERMES_CONSOLE_CONTROL_PLUGIN);
  await mkdir(targetRoot, { recursive: true, mode: 0o700 });

  for (const filename of EXTENSION_FILES) {
    const source = path.join(extensionSourceRoot(), filename);
    const content = await readFile(source);
    const target = path.join(targetRoot, filename);
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    try {
      await writeFile(temporary, content, { mode: 0o600 });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }
  return { plugin: HERMES_CONSOLE_CONTROL_PLUGIN, path: targetRoot };
}
