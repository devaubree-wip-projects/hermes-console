import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  hermesProfileHome,
  syncHermesConsoleControlExtension,
  validHermesProfileName,
} from "./extension-files";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Hermes Console control extension files", () => {
  test("rejects unsafe profile names", () => {
    expect(validHermesProfileName("agent-safe_1")).toBeTrue();
    expect(validHermesProfileName("../default")).toBeFalse();
    expect(() => hermesProfileHome("../default", "/tmp/hermes")).toThrow("Profil Hermes invalide");
  });

  test("refuses to write when the profile is not on this disk", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-console-extension-"));
    temporaryRoots.push(root);

    // The failure this guards against: a wrong HERMES_HOME used to make the
    // sync build a plausible tree the runtime never reads, and report success.
    await expect(syncHermesConsoleControlExtension({
      profile: "tenant-agent",
      hermesRoot: path.join(root, "hermes"),
    })).rejects.toThrow("Profil Hermes introuvable");
  });

  test("installs only the owned extension files in the selected profile", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-console-extension-"));
    temporaryRoots.push(root);
    await mkdir(path.join(root, "hermes", "profiles", "tenant-agent"), { recursive: true });

    const result = await syncHermesConsoleControlExtension({
      profile: "tenant-agent",
      hermesRoot: path.join(root, "hermes"),
    });

    expect(result.path).toBe(path.join(
      root,
      "hermes",
      "profiles",
      "tenant-agent",
      "plugins",
      "hermes-console-control",
    ));
    for (const filename of ["plugin.yaml", "__init__.py"] as const) {
      const source = path.join(process.cwd(), "hermes-extensions", "hermes-console-control", filename);
      expect(await readFile(path.join(result.path, filename), "utf8"))
        .toBe(await readFile(source, "utf8"));
    }
  });
});
