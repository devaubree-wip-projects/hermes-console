import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { resolveWorkspaceAccess } from "@/modules/auth/infrastructure/workspace-access-service";
import type { AgentContextPort } from "../domain/agent-context";

export const agentContextRepository: AgentContextPort = {
  async resolve(params) {
    const user = await requireUser();
    const access = await resolveWorkspaceAccess({ ...params, userId: user.id });
    if (!access) return null;
    const [agent] = await db.select().from(agents).where(and(
      eq(agents.workspaceId, access.workspaceId),
      eq(agents.slug, params.agentSlug),
    )).limit(1);
    return {
      userId: user.id,
      tenantId: access.tenantId,
      workspaceId: access.workspaceId,
      role: access.role,
      agent: agent ? {
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
        hermesProfileName: agent.hermesProfileName,
      } : null,
    };
  },
};
