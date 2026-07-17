import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

mock.module("server-only", () => ({}));
mock.module("@/lib/hermes/server", () => ({
  HermesRuntimeError: class HermesRuntimeError extends Error {},
}));
const { clearTelegramTokenLock } = await import("@/lib/hermes/gateway-locks");

const LOCAL = { origin: "local_managed", managementLevel: "managed" } as const;
const PROFILE = "atelier-lumiere-principal";

let home: string;
let locksDir: string;
const prevHome = process.env.HERMES_HOME;
const prevState = process.env.XDG_STATE_HOME;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "hermes-locks-"));
  process.env.HERMES_HOME = home;
  delete process.env.XDG_STATE_HOME;
  locksDir = path.join(home, ".local", "state", "hermes", "gateway-locks");
  await mkdir(locksDir, { recursive: true });
});

afterEach(async () => {
  if (prevHome === undefined) delete process.env.HERMES_HOME;
  else process.env.HERMES_HOME = prevHome;
  if (prevState === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = prevState;
  await chmod(locksDir, 0o700).catch(() => {});
  await rm(home, { recursive: true, force: true });
});

function telegramLock(hash: string) {
  return JSON.stringify({
    pid: 154,
    kind: "hermes-gateway",
    scope: "telegram-bot-token",
    identity_hash: hash,
    metadata: { platform: "telegram" },
  });
}

function discordLock() {
  return JSON.stringify({ scope: "discord-bot-token", metadata: { platform: "discord" } });
}

async function writeLock(name: string, content: string) {
  await writeFile(path.join(locksDir, name), content);
}

async function lockFiles() {
  return (await readdir(locksDir)).sort();
}

async function writeProfileState(name: string, telegramState: string | null) {
  const dir = path.join(home, "profiles", name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "gateway_state.json"),
    JSON.stringify({ platforms: { telegram: telegramState ? { state: telegramState } : null } }),
  );
}

describe("clearTelegramTokenLock", () => {
  test("refuses external installations without touching files", async () => {
    await writeLock("telegram-bot-token-a.lock", telegramLock("a"));
    const result = await clearTelegramTokenLock(PROFILE, { origin: "local_managed", managementLevel: "external" });
    expect(result.status).toBe("unsupported");
    expect(await lockFiles()).toHaveLength(1);
  });

  test("refuses remote runtimes (no local file to reconcile)", async () => {
    await writeLock("telegram-bot-token-a.lock", telegramLock("a"));
    const result = await clearTelegramTokenLock(PROFILE, { origin: "remote_provisioned", managementLevel: "managed" });
    expect(result.status).toBe("unsupported");
    expect(await lockFiles()).toHaveLength(1);
  });

  test("no-op when no lock exists", async () => {
    expect((await clearTelegramTokenLock(PROFILE, LOCAL)).status).toBe("none");
  });

  test("no-op when the locks directory is absent", async () => {
    await rm(locksDir, { recursive: true, force: true });
    expect((await clearTelegramTokenLock(PROFILE, LOCAL)).status).toBe("none");
  });

  test("ignores non-telegram locks", async () => {
    await writeLock("discord-bot-token-a.lock", discordLock());
    const result = await clearTelegramTokenLock(PROFILE, LOCAL);
    expect(result.status).toBe("none");
    expect(await lockFiles()).toEqual(["discord-bot-token-a.lock"]);
  });

  test("never acts on unparseable files", async () => {
    await writeLock("telegram-bot-token-a.lock", "{ not json");
    const result = await clearTelegramTokenLock(PROFILE, LOCAL);
    expect(result.status).toBe("none");
    expect(await lockFiles()).toHaveLength(1);
  });

  test("refuses to guess when several telegram locks exist", async () => {
    await writeLock("telegram-bot-token-a.lock", telegramLock("a"));
    await writeLock("telegram-bot-token-b.lock", telegramLock("b"));
    const result = await clearTelegramTokenLock(PROFILE, LOCAL);
    expect(result.status).toBe("ambiguous");
    expect(await lockFiles()).toHaveLength(2);
  });

  test("clears the single telegram lock and keeps unrelated locks", async () => {
    await writeLock("telegram-bot-token-a.lock", telegramLock("a"));
    await writeLock("discord-bot-token-a.lock", discordLock());
    const result = await clearTelegramTokenLock(PROFILE, LOCAL);
    expect(result.status).toBe("cleared");
    expect(await lockFiles()).toEqual(["discord-bot-token-a.lock"]);
  });

  test("refuses when another profile is live-connected to the same bot", async () => {
    await writeLock("telegram-bot-token-a.lock", telegramLock("a"));
    await writeProfileState("test-test-assistant-principal", "connected");
    const result = await clearTelegramTokenLock(PROFILE, LOCAL);
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") expect(result.profile).toBe("test-test-assistant-principal");
    expect(await lockFiles()).toHaveLength(1);
  });

  test("still clears when only the current profile (or none) is connected", async () => {
    await writeLock("telegram-bot-token-a.lock", telegramLock("a"));
    await writeProfileState(PROFILE, "connected");
    await writeProfileState("some-other-profile", "retrying");
    const result = await clearTelegramTokenLock(PROFILE, LOCAL);
    expect(result.status).toBe("cleared");
    expect(await lockFiles()).toHaveLength(0);
  });

  test("refuses cleanly when the locks directory is read-only", async () => {
    if (typeof process.getuid === "function" && process.getuid() === 0) return; // root bypasses dir perms
    await writeLock("telegram-bot-token-a.lock", telegramLock("a"));
    await chmod(locksDir, 0o500);
    const result = await clearTelegramTokenLock(PROFILE, LOCAL);
    expect(result.status).toBe("unsupported");
    expect(await lockFiles()).toHaveLength(1);
  });
});
