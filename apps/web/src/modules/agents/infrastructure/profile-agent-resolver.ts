import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { agents, workspaces } from "@/db/schema";

export type ConsoleAgentRow = {
  agentId: string;
  name: string;
  description: string | null;
  hermesProfileName: string;
  workspaceId: string;
  createdByUserId: string;
  runtimeState: string;
  tenantId: string;
};

export type ProfileAgentResolution =
  | { ok: true; agent: ConsoleAgentRow }
  | { ok: false; status: 404 | 409; message: string };

/**
 * Resolve the Console agent behind a Hermes profile by `(installation, profile)`,
 * never by name — so renaming an agent never detaches its Telegram bot.
 *
 * Returns a resolution instead of throwing: each command ingress owns its own
 * error type, and this read is shared between all of them.
 */
export async function resolveConsoleAgentByProfile(input: {
  installationIds: string[];
  profile: string;
}): Promise<ProfileAgentResolution> {
  const matches = await db
    .select({
      agentId: agents.id,
      name: agents.name,
      description: agents.description,
      hermesProfileName: agents.hermesProfileName,
      workspaceId: agents.workspaceId,
      createdByUserId: agents.createdByUserId,
      runtimeState: agents.runtimeState,
      tenantId: workspaces.tenantId,
    })
    .from(agents)
    .innerJoin(workspaces, eq(workspaces.id, agents.workspaceId))
    .where(
      and(
        inArray(agents.runtimeInstallationId, input.installationIds),
        eq(agents.hermesProfileName, input.profile),
      ),
    )
    .limit(2);

  if (matches.length === 0)
    return { ok: false, status: 404, message: "Aucun agent Console ne correspond à ce profil Hermes." };
  if (matches.length !== 1)
    return { ok: false, status: 409, message: "Le profil Hermes correspond à plusieurs agents Console." };
  return { ok: true, agent: matches[0] };
}
