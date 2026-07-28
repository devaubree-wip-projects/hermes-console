import "server-only";

import { readFile, readdir, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ResolvedRuntimeInstallation } from "@/lib/hermes/installations";
import { HermesRuntimeError } from "@/lib/hermes/runtime-error";

type GatewayLock = {
  scope?: unknown;
  metadata?: { platform?: unknown } | null;
};

export type ClearTelegramLockResult =
  | { status: "cleared" }
  | { status: "none" }
  | { status: "ambiguous"; count: number }
  | { status: "conflict"; profile: string }
  | { status: "unsupported"; reason: string };

function hermesHome() {
  return process.env.HERMES_HOME?.trim() || path.join(homedir(), ".hermes");
}

/**
 * Resolve the machine-global Hermes gateway-locks directory. The Telegram
 * bot-token lock is keyed by `hash(token)` and lives outside any profile, under
 * the runtime's XDG state home (default `$HERMES_HOME/.local/state`).
 */
function gatewayLocksDir() {
  const stateHome = process.env.XDG_STATE_HOME?.trim() || path.join(hermesHome(), ".local", "state");
  return path.join(stateHome, "hermes", "gateway-locks");
}

function isTelegramTokenLock(lock: GatewayLock) {
  return lock.scope === "telegram-bot-token" && lock.metadata?.platform === "telegram";
}

/**
 * Find another profile whose gateway currently reports Telegram as `connected`.
 *
 * Precise, false-positive-free *given a single* telegram-bot-token lock: the
 * lock is keyed by token hash, so one lock means one bot; a connected Telegram
 * gateway necessarily holds a lock, therefore any *other* connected profile is
 * the live holder of that very lock (a genuine same-token conflict). When two
 * bots are involved there are two locks and the caller bails out as ambiguous
 * before ever reaching this check — so this never blocks a real stale-lock fix.
 */
async function otherConnectedTelegramProfile(currentProfile: string): Promise<string | null> {
  const profilesDir = path.join(hermesHome(), "profiles");
  let names: string[];
  try {
    names = await readdir(profilesDir);
  } catch {
    return null;
  }
  for (const name of names) {
    if (name === currentProfile) continue;
    try {
      const state = JSON.parse(
        await readFile(path.join(profilesDir, name, "gateway_state.json"), "utf8"),
      ) as { platforms?: { telegram?: { state?: unknown } | null } };
      if (state.platforms?.telegram?.state === "connected") return name;
    } catch {
      // Unreadable / missing profile state: ignore.
    }
  }
  return null;
}

/**
 * Delete a residual Telegram bot-token lock so Hermes can re-acquire it cleanly
 * on the next (re)start (fixes the "token already in use (PID …)" lockout when
 * re-plugging an existing bot after a crash / reinstall / container recreate).
 *
 * Deliberate constraints, imposed by the runtime topology:
 *  - The lock's PID belongs to the Hermes *container's* PID namespace, so the
 *    console (Next.js on the host) cannot decide liveness from `/proc`. It
 *    therefore never *proves* staleness — the caller asserts it (an explicit
 *    Owner action, or a gateway the console has confirmed stopped).
 *  - Local, file-owning installations only. A remote/external runtime keeps its
 *    lock on its own host; a read-only prod volume rejects the unlink cleanly.
 *  - Scoped to the Telegram token lock, never a global sweep; refuses when more
 *    than one candidate exists rather than guessing.
 *  - Only ever `unlink` — the console is not the Telegram poller and must never
 *    forge a lock under its own identity. Re-creation stays Hermes' job.
 */
export async function clearTelegramTokenLock(
  profile: string,
  installation: Pick<ResolvedRuntimeInstallation, "origin" | "managementLevel">,
): Promise<ClearTelegramLockResult> {
  if (installation.managementLevel === "external") {
    return { status: "unsupported", reason: "Installation externe : le verrou est géré par son propriétaire." };
  }
  if (installation.origin !== "local_managed") {
    return { status: "unsupported", reason: "Runtime distant : aucun verrou local à réconcilier depuis la console." };
  }

  const dir = gatewayLocksDir();
  let entries: string[];
  try {
    entries = (await readdir(dir)).filter((name) => name.endsWith(".lock"));
  } catch {
    return { status: "none" };
  }

  const candidates: Array<{ file: string; ino: number; mtimeMs: number }> = [];
  for (const name of entries) {
    const file = path.join(dir, name);
    try {
      const parsed = JSON.parse(await readFile(file, "utf8")) as GatewayLock;
      if (!isTelegramTokenLock(parsed)) continue;
      const info = await stat(file);
      candidates.push({ file, ino: info.ino, mtimeMs: info.mtimeMs });
    } catch {
      // Unparseable, wrong schema, or vanished: never act on a file we cannot recognise.
    }
  }

  if (candidates.length === 0) return { status: "none" };
  if (candidates.length > 1) return { status: "ambiguous", count: candidates.length };

  // Safety: with exactly one telegram lock, a *different* profile reporting
  // Telegram `connected` is the live holder of this very bot. Deleting the lock
  // would make both gateways poll the same token → Telegram 409 flapping. Refuse.
  const liveOwner = await otherConnectedTelegramProfile(profile);
  if (liveOwner) return { status: "conflict", profile: liveOwner };

  const target = candidates[0];
  try {
    // TOCTOU: if Hermes rewrote the lock since we read it, a gateway is actively
    // (re)acquiring it — treat it as live and refuse to delete.
    const fresh = await stat(target.file);
    if (fresh.ino !== target.ino || fresh.mtimeMs !== target.mtimeMs) {
      return { status: "none" };
    }
    await unlink(target.file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return { status: "none" };
    if (code === "EROFS" || code === "EACCES" || code === "EPERM") {
      return {
        status: "unsupported",
        reason: "Volume Hermes en lecture seule : débloque le verrou sur l’hôte du runtime.",
      };
    }
    throw new HermesRuntimeError(
      error instanceof Error ? `Suppression du verrou impossible : ${error.message}` : "Suppression du verrou impossible.",
      500,
    );
  }
  return { status: "cleared" };
}
