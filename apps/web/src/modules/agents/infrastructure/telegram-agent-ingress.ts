import "server-only";

import { getWorkspaceAccessForUserById } from "@/lib/workspace";
import { AgentCreationError, createAgent } from "@/modules/agents/application/create-agent";
import { resolveConsoleAgentByProfile } from "@/modules/agents/infrastructure/profile-agent-resolver";
import { listTenantAgents } from "@/modules/agents/infrastructure/tenant-agent-roster";

/** Carries the HTTP status the Telegram caller should see, without leaking internals. */
export class AgentIngressError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

type TelegramAgentInput = {
  installationIds: string[];
  profile: string;
  telegramUserId: string;
  telegramChatId: string;
};

/**
 * `/agent` from Telegram. The gateway allowlist proves *who* sent the message;
 * it is not an authorization decision — provisioning runtime stays gated on the
 * Console role of the account that owns the calling agent, exactly like the
 * mission command. A paired member who is not an Owner is refused here.
 */
export async function createTelegramAgent(input: TelegramAgentInput & {
  name: string;
  mission: string;
}) {
  const resolution = await resolveConsoleAgentByProfile(input);
  if (!resolution.ok) throw new AgentIngressError(resolution.status, resolution.message);
  const caller = resolution.agent;

  const access = await getWorkspaceAccessForUserById(caller.workspaceId, caller.createdByUserId);
  if (!access)
    throw new AgentIngressError(403, "Le propriétaire de cet agent n’a plus accès à l’espace.");

  try {
    const { agent, runtimeState, runtimeError } = await createAgent({
      access,
      actorUserId: caller.createdByUserId,
      name: input.name,
      description: input.mission,
      origin: {
        source: "telegram",
        telegramUserId: input.telegramUserId,
        telegramChatId: input.telegramChatId,
        requestedByAgentId: caller.agentId,
      },
    });
    return {
      name: agent.name,
      slug: agent.slug,
      profile: agent.hermesProfileName,
      runtimeState,
      // Surfaced verbatim so a failed provisioning is diagnosable from the phone
      // instead of silently producing an agent that will never answer.
      runtimeError,
    };
  } catch (error) {
    if (error instanceof AgentCreationError)
      throw new AgentIngressError(error.status, error.message, error.code);
    throw error;
  }
}

/** `/agent` with no argument: the roster the sender can switch between. */
export async function listTelegramAgents(input: TelegramAgentInput) {
  const resolution = await resolveConsoleAgentByProfile(input);
  if (!resolution.ok) throw new AgentIngressError(resolution.status, resolution.message);
  const caller = resolution.agent;

  const access = await getWorkspaceAccessForUserById(caller.workspaceId, caller.createdByUserId);
  if (!access)
    throw new AgentIngressError(403, "Le propriétaire de cet agent n’a plus accès à l’espace.");

  return {
    current: caller.hermesProfileName,
    agents: await listTenantAgents(access.tenant.id),
  };
}
