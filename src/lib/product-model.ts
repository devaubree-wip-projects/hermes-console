import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, tenants, workspaces } from "@/db/schema";
import { hermesProfileName, toSlug } from "@/lib/slugs";

async function nextAvailable(base: string, exists: (candidate: string) => Promise<boolean>) {
  for (let index = 1; index <= 999; index += 1) {
    const suffix = index === 1 ? "" : `-${index}`;
    const candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error("Impossible de générer un identifiant unique.");
}

export function allocateTenantSlug(name: string) {
  const base = toSlug(name, "organisation");
  return nextAvailable(base, async (candidate) => {
    const row = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, candidate)).limit(1);
    return row.length > 0;
  });
}

export function allocateWorkspaceSlug(tenantId: string, name: string) {
  const base = toSlug(name, "workspace");
  return nextAvailable(base, async (candidate) => {
    const row = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.slug, candidate)))
      .limit(1);
    return row.length > 0;
  });
}

export function allocateAgentIdentity(
  workspaceId: string,
  tenantSlug: string,
  workspaceSlug: string,
  name: string,
) {
  const baseSlug = toSlug(name, "agent");
  return nextAvailable(baseSlug, async (candidate) => {
    const profile = hermesProfileName(tenantSlug, workspaceSlug, candidate);
    const row = await db
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.workspaceId, workspaceId),
          eq(agents.slug, candidate),
        ),
      )
      .limit(1);
    if (row.length > 0) return true;
    const profileRow = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.hermesProfileName, profile))
      .limit(1);
    return profileRow.length > 0;
  }).then((slug) => ({
    slug,
    profileName: hermesProfileName(tenantSlug, workspaceSlug, slug),
  }));
}
