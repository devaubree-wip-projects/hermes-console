import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import type { AgentIdInput } from "@/lib/chat-agent-context";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalize(input: string | null | undefined): string | null {
  const value = typeof input === "string" ? input.trim() : "";
  return value.length > 0 ? value : null;
}

export async function resolveWorkspaceAgentId(
  workspaceId: string,
  { agentId, agentSlug }: AgentIdInput,
): Promise<string | null> {
  const requestedId = normalize(agentId);
  const requestedSlug = normalize(agentSlug);

  if (requestedId && UUID_RE.test(requestedId)) {
    const [agent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, requestedId), eq(agents.workspaceId, workspaceId)))
      .limit(1);
    if (agent) return agent.id;
  }

  if (requestedSlug) {
    const [agent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.workspaceId, workspaceId), eq(agents.slug, requestedSlug)))
      .limit(1);
    if (agent) return agent.id;
  }

  if (!requestedId && !requestedSlug) {
    const [agent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.workspaceId, workspaceId))
      .orderBy(asc(agents.createdAt))
      .limit(1);
    if (agent) return agent.id;
  }

  return null;
}
