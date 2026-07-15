import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { importHermesProfile, rollbackHermesProfileImport, verifyHermesProfileImport } from "./profile-import";

const roots: string[] = [];

async function exists(target: string) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "hermes-import-"));
  roots.push(root);
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  await mkdir(path.join(source, "sessions"), { recursive: true });
  await writeFile(path.join(source, "config.yaml"), "model: test\n");
  await writeFile(path.join(source, "sessions", "one.json"), "{}\n");
  await writeFile(path.join(source, ".env"), "SECRET=value\n");
  return { source, target };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("controlled Hermes profile import", () => {
  test("copies allowlisted state atomically, excludes secrets and supports verified rollback", async () => {
    const { source, target } = await fixture();
    const imported = await importHermesProfile({
      sourceRoot: source,
      targetRoot: target,
      sourceProfile: "default",
      targetProfile: "imported-default",
      now: new Date("2026-07-15T12:00:00Z"),
    });
    expect(await readFile(path.join(imported.target, "config.yaml"), "utf8")).toBe("model: test\n");
    expect(await exists(path.join(imported.target, ".env"))).toBeFalse();
    expect((await verifyHermesProfileImport(target, "imported-default")).includeSecrets).toBeFalse();
    await rollbackHermesProfileImport(target, "imported-default");
    expect(await exists(imported.target)).toBeFalse();
  });

  test("refuses symlinks and implicit overwrite", async () => {
    const { source, target } = await fixture();
    await symlink("/etc/passwd", path.join(source, "sessions", "escape"));
    expect(importHermesProfile({ sourceRoot: source, targetRoot: target, sourceProfile: "default", targetProfile: "safe" }))
      .rejects.toThrow("lien symbolique");
    expect(importHermesProfile({ sourceRoot: source, targetRoot: target, sourceProfile: "default", targetProfile: "default" }))
      .rejects.toThrow("default");
  });
});
