import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, workspaces } from "@/db/schema";

/** The tenant's agents, oldest first — the roster `/agent` shows. */
export async function listTenantAgents(tenantId: string) {
  return db
    .select({
      name: agents.name,
      slug: agents.slug,
      profile: agents.hermesProfileName,
      runtimeState: agents.runtimeState,
    })
    .from(agents)
    .innerJoin(workspaces, eq(workspaces.id, agents.workspaceId))
    .where(eq(workspaces.tenantId, tenantId))
    .orderBy(asc(agents.createdAt));
}
