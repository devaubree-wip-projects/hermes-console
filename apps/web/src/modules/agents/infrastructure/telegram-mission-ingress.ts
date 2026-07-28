import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, auditEvents } from "@/db/schema";
import { MissionBlockError } from "@/lib/hermes/mission";
import { fetchAgentMission, publishAgentMission } from "@/lib/hermes/mission-sync";
import { HermesRuntimeError, runtimeErrorMessage } from "@/lib/hermes/server";
import { canConfigureRuntime, getWorkspaceAccessForUserById } from "@/lib/workspace";
import { resolveConsoleAgentByProfile } from "@/modules/agents/infrastructure/profile-agent-resolver";

/** Carries the HTTP status the Telegram caller should see, without leaking internals. */
export class MissionIngressError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

type TelegramMissionInput = {
  installationIds: string[];
  profile: string;
  telegramUserId: string;
  telegramChatId: string;
};

async function resolveAgent(input: TelegramMissionInput) {
  const resolution = await resolveConsoleAgentByProfile(input);
  if (!resolution.ok) throw new MissionIngressError(resolution.status, resolution.message);
  return resolution.agent;
}

export async function readTelegramAgentMission(input: TelegramMissionInput) {
  const agent = await resolveAgent(input);
  try {
    return { name: agent.name, mission: await fetchAgentMission(agent) };
  } catch (error) {
    if (error instanceof MissionBlockError) throw new MissionIngressError(409, error.message);
    throw new MissionIngressError(
      502,
      runtimeErrorMessage(error, "Runtime Hermes indisponible : mission illisible."),
    );
  }
}

/**
 * Rewriting the mission rewrites the agent's system prompt, so it stays gated on
 * the Console role of the agent's owner — the Telegram allowlist alone is not an
 * authorization decision. Every change is audited with the Telegram identity that
 * requested it, because from the Console's side the actor is the owner account.
 */
export async function updateTelegramAgentMission(
  input: TelegramMissionInput & { mission: string },
) {
  const agent = await resolveAgent(input);
  if (agent.runtimeState !== "ready")
    throw new MissionIngressError(409, "L’agent Console n’est pas prêt.");

  const access = await getWorkspaceAccessForUserById(agent.workspaceId, agent.createdByUserId);
  if (!access || !canConfigureRuntime(access.role))
    throw new MissionIngressError(
      403,
      "Le propriétaire de cet agent n’a pas le droit de modifier sa mission.",
    );

  try {
    await publishAgentMission(agent, input.mission);
  } catch (error) {
    if (error instanceof MissionBlockError) throw new MissionIngressError(409, error.message);
    throw new MissionIngressError(
      error instanceof HermesRuntimeError && error.status ? error.status : 502,
      runtimeErrorMessage(error, "Runtime Hermes indisponible : mission inchangée."),
    );
  }

  const mission = input.mission.trim();
  await db.transaction(async (tx) => {
    await tx
      .update(agents)
      .set({ description: mission || null, updatedAt: new Date() })
      .where(eq(agents.id, agent.agentId));
    await tx.insert(auditEvents).values({
      tenantId: agent.tenantId,
      workspaceId: agent.workspaceId,
      actorUserId: agent.createdByUserId,
      action: "agent.mission_updated",
      targetType: "agent",
      targetId: agent.agentId,
      metadata: {
        source: "telegram",
        telegramUserId: input.telegramUserId,
        telegramChatId: input.telegramChatId,
        cleared: mission.length === 0,
      },
    });
  });

  // The previous mission travels back so the caller can show what it replaced —
  // the only undo available to someone typing this from a phone.
  return { name: agent.name, mission: mission || null, previous: agent.description ?? null };
}
