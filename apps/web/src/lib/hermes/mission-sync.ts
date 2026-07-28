import "server-only";

import { applyMission, readMission } from "@/lib/hermes/mission";
import {
  readHermesProfileSoul,
  writeHermesProfileDescription,
  writeHermesProfileSoul,
} from "@/lib/hermes/server";

/**
 * `agentId` for an existing agent, `installationId` when the row does not exist
 * yet — agent creation publishes the mission before it has an id to scope on.
 */
export type MissionTarget = {
  hermesProfileName: string;
  agentId?: string;
  installationId?: string;
};

function runtimeScope(target: MissionTarget) {
  return target.agentId ? { agentId: target.agentId } : { installationId: target.installationId };
}

/** The mission the runtime is actually serving, read back from `SOUL.md`. */
export async function fetchAgentMission(target: MissionTarget): Promise<string | null> {
  const soul = await readHermesProfileSoul(target.hermesProfileName, runtimeScope(target));
  return readMission(soul.content ?? "");
}

/**
 * Publish the mission to the profile: the delimited block of `SOUL.md` (what the
 * agent is), then the profile description (what Hermes routes on). The read is
 * mandatory — writing `SOUL.md` blind would drop the runtime's own identity and
 * anything a human added to the file.
 *
 * Callers must treat a rejection as "the mission did not change", so the Console
 * never persists a mission the agent isn't running.
 */
export async function publishAgentMission(
  target: MissionTarget,
  mission: string,
): Promise<void> {
  const scope = runtimeScope(target);
  const soul = await readHermesProfileSoul(target.hermesProfileName, scope);
  const updated = applyMission(soul.content ?? "", mission);
  if (updated !== (soul.content ?? "")) {
    await writeHermesProfileSoul(target.hermesProfileName, updated, scope);
  }
  await writeHermesProfileDescription(target.hermesProfileName, mission.trim(), scope);
}
