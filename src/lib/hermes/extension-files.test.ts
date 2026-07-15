import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
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

  test("installs only the owned extension files in the selected profile", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-console-extension-"));
    temporaryRoots.push(root);
    const sourceRoot = path.join(root, "source");
    await mkdir(sourceRoot, { recursive: true });
    await writeFile(path.join(sourceRoot, "plugin.yaml"), "name: hermes-console-control\n");
    await writeFile(path.join(sourceRoot, "__init__.py"), "VALUE = 1\n");

    const result = await syncHermesConsoleControlExtension({
      profile: "tenant-agent",
      hermesRoot: path.join(root, "hermes"),
      sourceRoot,
    });

    expect(result.path).toBe(path.join(
      root,
      "hermes",
      "profiles",
      "tenant-agent",
      "plugins",
      "hermes-console-control",
    ));
    expect(await readFile(path.join(result.path, "plugin.yaml"), "utf8"))
      .toBe("name: hermes-console-control\n");
    expect(await readFile(path.join(result.path, "__init__.py"), "utf8"))
      .toBe("VALUE = 1\n");
  });
});
