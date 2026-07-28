import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { agents, workspaces } from "@/db/schema";
import { canAtLeast, getWorkspaceAccessForUserById } from "@/lib/workspace";
import {
  createWorkspaceWorkItem,
  WorkConflictError,
  WorkNotFoundError,
} from "./work-service";

export async function createTelegramWorkItem(input: {
  installationIds: string[];
  profile: string;
  title: string;
  description: string;
  telegramUserId: string;
  telegramChatId: string;
  telegramMessageId?: string;
  telegramUpdateId?: number;
}) {
  const matches = await db
    .select({
      agentId: agents.id,
      workspaceId: agents.workspaceId,
      createdByUserId: agents.createdByUserId,
      runtimeState: agents.runtimeState,
      tenantId: workspaces.tenantId,
      workspaceSlug: workspaces.slug,
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

  if (matches.length === 0) {
    throw new WorkNotFoundError(
      "Aucun agent Console ne correspond à ce profil Hermes.",
    );
  }
  if (matches.length !== 1) {
    throw new WorkConflictError(
      "Le profil Hermes correspond à plusieurs agents Console.",
    );
  }

  const agent = matches[0];
  if (agent.runtimeState !== "ready") {
    throw new WorkConflictError("L’agent Console n’est pas prêt.");
  }
  const access = await getWorkspaceAccessForUserById(
    agent.workspaceId,
    agent.createdByUserId,
  );
  if (!access || !canAtLeast(access.role, "member")) {
    throw new WorkConflictError(
      "Le propriétaire de l’agent ne peut pas créer de tâche dans ce workspace.",
    );
  }

  return createWorkspaceWorkItem({
    context: {
      tenantId: agent.tenantId,
      workspaceId: agent.workspaceId,
      workspaceSlug: agent.workspaceSlug,
      userId: agent.createdByUserId,
      role: access.role,
    },
    title: input.title,
    description: input.description,
    assignee: { type: "agent", agentId: agent.agentId },
    enqueue: true,
    auditMetadata: {
      source: "telegram",
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramChatId,
      ...(input.telegramMessageId
        ? { telegramMessageId: input.telegramMessageId }
        : {}),
      ...(input.telegramUpdateId !== undefined
        ? { telegramUpdateId: input.telegramUpdateId }
        : {}),
    },
  });
}
