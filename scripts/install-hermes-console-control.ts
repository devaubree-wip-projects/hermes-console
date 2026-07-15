import {
  HERMES_CONSOLE_CONTROL_PLUGIN,
  syncHermesConsoleControlExtension,
} from "../apps/web/src/lib/hermes/extension-files";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

const profile = argument("--profile");
if (!profile) {
  console.error("Usage: bun run scripts/install-hermes-console-control.ts --profile <profile> [--restart]");
  process.exit(1);
}

const runtimeUrl = (process.env.HERMES_RUNTIME_URL ?? "http://127.0.0.1:9119").replace(/\/$/, "");
const runtimeToken = process.env.HERMES_DASHBOARD_SESSION_TOKEN
  || process.env.HERMES_RUNTIME_TOKEN
  || "hermes-console-local-runtime";

async function runtimeFetch<T>(pathname: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (runtimeToken) {
    headers.set("X-Hermes-Session-Token", runtimeToken);
    headers.set("Authorization", `Bearer ${runtimeToken}`);
  }
  const response = await fetch(`${runtimeUrl}${pathname}`, { ...init, headers });
  if (!response.ok) throw new Error(`Hermes a répondu ${response.status}.`);
  return response.json() as Promise<T>;
}

const result = await syncHermesConsoleControlExtension({ profile });
const encodedProfile = encodeURIComponent(profile);
const config = await runtimeFetch<{
  plugins?: { enabled?: unknown; disabled?: unknown };
}>(`/api/config?profile=${encodedProfile}`);
const enabled = Array.isArray(config.plugins?.enabled)
  ? config.plugins.enabled.filter((item): item is string => typeof item === "string")
  : [];
const disabled = Array.isArray(config.plugins?.disabled)
  ? config.plugins.disabled.filter((item): item is string => (
    typeof item === "string" && item !== HERMES_CONSOLE_CONTROL_PLUGIN
  ))
  : [];
await runtimeFetch(`/api/config?profile=${encodedProfile}`, {
  method: "PUT",
  body: JSON.stringify({
    profile,
    config: {
      plugins: {
        enabled: [...new Set([...enabled, HERMES_CONSOLE_CONTROL_PLUGIN])],
        disabled,
      },
    },
  }),
});
console.log(`Extension ${result.plugin} synchronisée dans ${result.path}`);

if (process.argv.includes("--restart")) {
  const command = process.env.HERMES_CLI_PATH?.trim() || "hermes";
  const child = Bun.spawn([command, "-p", profile, "gateway", "restart"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error((stderr || stdout).trim() || "Redémarrage du gateway impossible.");
  console.log((stdout || stderr).trim() || "Gateway redémarré.");
}
