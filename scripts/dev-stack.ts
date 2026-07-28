import { mkdir, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises";
import path from "node:path";

type DevState = {
  cwd: string;
  orchestratorPid: number;
  nextPid: number | null;
  startedAt: string;
};

const root = process.cwd();
const stateFile = path.join(root, ".next", "hermes-console-dev.json");
const compose = [
  "docker",
  "compose",
  "--project-directory",
  root,
  "-f",
  "infra/dev/compose.yaml",
  "-f",
  "infra/dev/compose.override.yaml",
];
const commandEnvironment = {
  ...process.env,
  HERMES_UID: String(process.getuid?.() ?? 1000),
  HERMES_GID: String(process.getgid?.() ?? 1000),
  HERMES_DEFAULT_GATEWAY_URL: process.env.HERMES_DEFAULT_GATEWAY_URL?.trim() || "http://127.0.0.1:8787",
  HERMES_DEFAULT_INSTALLATION_ID: process.env.HERMES_DEFAULT_INSTALLATION_ID?.trim() || "local-default",
  HERMES_GATEWAY_SERVICE_SECRET: process.env.HERMES_GATEWAY_SERVICE_SECRET?.trim()
    || "hermes-console-local-development-service",
  HERMES_GATEWAY_TICKET_SECRET: process.env.HERMES_GATEWAY_TICKET_SECRET?.trim()
    || "hermes-console-local-development-ticket",
  HERMES_GATEWAY_DERIVE_SECRETS: process.env.HERMES_GATEWAY_DERIVE_SECRETS?.trim() || "true",
  HERMES_IMAGE_TAG: process.env.HERMES_IMAGE_TAG?.trim() || "latest",
};

let nextProcess: ReturnType<typeof Bun.spawn> | null = null;
let activeCommandProcess: ReturnType<typeof Bun.spawn> | null = null;
let shutdownPromise: Promise<void> | null = null;
let stopping = false;

function isAlive(pid: number | null | undefined) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function isOwnedByRepository(pid: number) {
  try {
    return path.resolve(await readlink(`/proc/${pid}/cwd`)) === root;
  } catch {
    return false;
  }
}

function signalProcess(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // The process already stopped.
    }
  }
}

async function waitUntilStopped(pid: number, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (isAlive(pid) && Date.now() < deadline) {
    await Bun.sleep(100);
  }
  return !isAlive(pid);
}

async function terminateOwnedProcess(pid: number | null | undefined) {
  if (!pid || !isAlive(pid) || !await isOwnedByRepository(pid)) return;
  signalProcess(pid, "SIGTERM");
  if (!await waitUntilStopped(pid)) {
    signalProcess(pid, "SIGKILL");
    await waitUntilStopped(pid, 2_000);
  }
}

async function run(command: string[], options: { quiet?: boolean } = {}) {
  const child = Bun.spawn(command, {
    cwd: root,
    env: commandEnvironment,
    stdout: options.quiet ? "ignore" : "inherit",
    stderr: options.quiet ? "ignore" : "inherit",
    detached: true,
  });
  activeCommandProcess = child;
  try {
    const exitCode = await child.exited;
    if (exitCode !== 0) throw new Error(`Commande échouée (${exitCode}) : ${command.join(" ")}`);
  } finally {
    if (activeCommandProcess?.pid === child.pid) activeCommandProcess = null;
  }
}

async function composeDown(quiet = false) {
  try {
    await run([...compose, "down", "--remove-orphans", "--timeout", "10"], { quiet });
  } catch (error) {
    if (!quiet) console.error(error instanceof Error ? error.message : error);
  }
}

async function readState() {
  try {
    const state = JSON.parse(await readFile(stateFile, "utf8")) as DevState;
    return state.cwd === root ? state : null;
  } catch {
    return null;
  }
}

async function writeState(nextPid: number | null) {
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, `${JSON.stringify({
    cwd: root,
    orchestratorPid: process.pid,
    nextPid,
    startedAt: new Date().toISOString(),
  } satisfies DevState, null, 2)}\n`, { mode: 0o600 });
}

function isDevCommand(command: string) {
  return command.includes("next dev --port 3010")
    || command.includes("next-server")
    || command.includes("go run ./cmd/hermes-gateway")
    || command.includes("/hermes-gateway")
    || command.includes("concurrently -k -n next,gateway");
}

async function stopOrphanedRepositoryProcesses(excluded = new Set<number>()) {
  const entries = await readdir("/proc", { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const pid = Number(entry.name);
    if (pid <= 1 || excluded.has(pid) || !await isOwnedByRepository(pid)) continue;
    const command = await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "");
    if (isDevCommand(command.replaceAll("\0", " "))) await terminateOwnedProcess(pid);
  }
}

async function stop() {
  const state = await readState();
  if (state && state.orchestratorPid !== process.pid && isAlive(state.orchestratorPid)) {
    process.kill(state.orchestratorPid, "SIGTERM");
    await waitUntilStopped(state.orchestratorPid, 15_000);
  }
  if (state?.nextPid) await terminateOwnedProcess(state.nextPid);
  await stopOrphanedRepositoryProcesses(new Set([process.pid, process.ppid]));
  await composeDown();
  await rm(stateFile, { force: true });
  console.log("Hermes Console arrêté : Next.js, Edge et Hermes sont stoppés.");
}

async function shutdown(exitCode: number) {
  if (shutdownPromise) return shutdownPromise;
  stopping = true;
  shutdownPromise = (async () => {
    if (activeCommandProcess && isAlive(activeCommandProcess.pid)) {
      signalProcess(activeCommandProcess.pid, "SIGTERM");
      const stopped = await Promise.race([
        activeCommandProcess.exited.then(() => true),
        Bun.sleep(3_000).then(() => false),
      ]);
      if (!stopped) signalProcess(activeCommandProcess.pid, "SIGKILL");
    }
    if (nextProcess && isAlive(nextProcess.pid)) {
      signalProcess(nextProcess.pid, "SIGTERM");
      const stopped = await Promise.race([
        nextProcess.exited.then(() => true),
        Bun.sleep(8_000).then(() => false),
      ]);
      if (!stopped) signalProcess(nextProcess.pid, "SIGKILL");
    }
    await composeDown();
    await rm(stateFile, { force: true });
    process.exitCode = exitCode;
  })();
  return shutdownPromise;
}

async function start() {
  const existing = await readState();
  if (existing && isAlive(existing.orchestratorPid)) {
    throw new Error(`Le mode développement tourne déjà (PID ${existing.orchestratorPid}). Lancez make stop avant.`);
  }
  await rm(stateFile, { force: true });
  await writeState(null);

  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  try {
    await mkdir(path.join(root, "data", "hermes"), { recursive: true });
    await mkdir(path.join(root, "data", "workspace"), { recursive: true });
    await mkdir(path.join(root, "data", "work"), { recursive: true });
    await mkdir(path.join(root, "data", "backups"), { recursive: true });
    console.log(`Synchronisation de l'image Hermes (${commandEnvironment.HERMES_IMAGE_TAG})…`);
    await run(["bun", "run", "scripts/sync-hermes-runtime-image.ts"]);
    if (stopping) return;
    console.log("Démarrage de Hermes et Edge (recreate si image mise à jour)…");
    await run([...compose, "up", "-d", "--pull", "always", "--force-recreate", "--no-deps", "hermes"]);
    await run([...compose, "up", "-d", "--wait", "edge"]);
    if (stopping) return;
    await run(["bun", "run", "scripts/sync-hermes-runtime-image.ts", "--prune-only"], { quiet: false });
    if (stopping) return;
    console.log("Synchronisation des installations et profils Hermes locaux…");
    await run(["bun", "run", "scripts/sync-local-runtime-profiles.ts"]);
    if (stopping) return;
    await rm(path.join(root, "apps", "web", ".next", "dev", "types"), { recursive: true, force: true });
    console.log("Runtime prêt. Démarrage de Next.js sur http://localhost:3010");
    nextProcess = Bun.spawn(["bun", "run", "dev"], {
      cwd: root,
      env: commandEnvironment,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      detached: true,
    });
    await writeState(nextProcess.pid);
    const exitCode = await nextProcess.exited;
    await shutdown(exitCode);
  } catch (error) {
    if (!stopping) console.error(error instanceof Error ? error.message : error);
    await shutdown(stopping ? 0 : 1);
  }
}

if (process.argv.includes("--stop")) {
  await stop();
} else {
  await start();
}
