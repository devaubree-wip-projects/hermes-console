import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const HERMES_CONSOLE_CONTROL_PLUGIN = "hermes-console-control";
const EXTENSION_FILES = ["plugin.yaml", "__init__.py"] as const;

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
  const targetRoot = path.join(
    hermesProfileHome(input.profile, input.hermesRoot),
    "plugins",
    HERMES_CONSOLE_CONTROL_PLUGIN,
  );
  await mkdir(targetRoot, { recursive: true, mode: 0o700 });

  for (const filename of EXTENSION_FILES) {
    const source = filename === "plugin.yaml"
      ? path.join(process.cwd(), "hermes-extensions", "hermes-console-control", "plugin.yaml")
      : path.join(process.cwd(), "hermes-extensions", "hermes-console-control", "__init__.py");
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
