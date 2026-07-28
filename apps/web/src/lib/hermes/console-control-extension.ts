import "server-only";

import {
  HERMES_CONSOLE_CONTROL_PLUGIN,
  syncHermesConsoleControlExtension,
} from "@/lib/hermes/extension-files";
import { hermesFetch } from "@/lib/hermes/server";
import { runtimeInstallationForAgent } from "@/lib/hermes/installations";

type HermesPluginConfig = {
  plugins?: {
    enabled?: unknown;
    disabled?: unknown;
  };
};

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

export async function ensureHermesConsoleControlExtension(agentId: string, profile: string) {
  const installation = await runtimeInstallationForAgent(agentId);
  if (installation.origin !== "local_managed") {
    return { installed: false, reason: "remote_installation" } as const;
  }
  const synced = await syncHermesConsoleControlExtension({ profile });
  const encodedProfile = encodeURIComponent(profile);
  const scope = { agentId, profile };
  const config = await hermesFetch<HermesPluginConfig>(`/api/config?profile=${encodedProfile}`, {}, scope);
  const enabled = [...new Set([
    ...stringList(config.plugins?.enabled),
    HERMES_CONSOLE_CONTROL_PLUGIN,
  ])];
  const disabled = stringList(config.plugins?.disabled).filter(
    (name) => name !== HERMES_CONSOLE_CONTROL_PLUGIN,
  );
  await hermesFetch<{ ok?: boolean }>(`/api/config?profile=${encodedProfile}`, {
    method: "PUT",
    body: JSON.stringify({
      profile,
      config: { plugins: { enabled, disabled } },
    }),
  }, scope);
  return synced;
}
