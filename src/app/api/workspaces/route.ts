import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, tenantMemberships, tenants, workspaces } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";
import { allocateAgentIdentity, allocateTenantSlug, allocateWorkspaceSlug } from "@/lib/product-model";
import { createHermesProfile } from "@/lib/hermes/server";
import { listWorkspacesForUser } from "@/lib/workspace";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const accessibleWorkspaces = await listWorkspacesForUser(user.id);
  if (accessibleWorkspaces.length === 0) {
    return NextResponse.json(
      { error: "Terminez d'abord la configuration initiale.", redirectTo: "/onboarding" },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 100) {
    return NextResponse.json(
      { error: "Le nom du workspace est requis (100 caractères max)." },
      { status: 400 },
    );
  }

  const [existingTenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.ownerUserId, user.id))
    .orderBy(asc(tenants.createdAt))
    .limit(1);

  const tenant =
    existingTenant ??
    (await db
      .insert(tenants)
      .values({ name: user.name, slug: await allocateTenantSlug(user.name), ownerUserId: user.id })
      .returning())[0];
  await db
    .insert(tenantMemberships)
    .values({ tenantId: tenant.id, userId: user.id, role: "owner" })
    .onConflictDoNothing();

  const workspaceSlug = await allocateWorkspaceSlug(tenant.id, name);
  const [workspace] = await db
    .insert(workspaces)
    .values({
      tenantId: tenant.id,
      name,
      slug: workspaceSlug,
      hermesBaseUrl: process.env.HERMES_RUNTIME_URL ?? "http://127.0.0.1:9119",
      permissions: DEFAULT_PERMISSIONS,
    })
    .returning();

  const identity = await allocateAgentIdentity(
    workspace.id,
    tenant.slug,
    workspace.slug,
    "Assistant principal",
  );
  const [agent] = await db
    .insert(agents)
    .values({
      workspaceId: workspace.id,
      slug: identity.slug,
      name: "Assistant principal",
      description: "Agent principal du workspace",
      hermesProfileName: identity.profileName,
      createdByUserId: user.id,
    })
    .returning();
  try {
    await createHermesProfile({ name: identity.profileName, description: agent.description });
    await db.update(agents).set({ runtimeState: "ready", runtimeError: null }).where(eq(agents.id, agent.id));
  } catch (error) {
    await db.update(agents).set({
      runtimeState: "setup_required",
      runtimeError: error instanceof Error ? error.message.slice(0, 500) : "Runtime Hermes indisponible.",
    }).where(eq(agents.id, agent.id));
  }

  return NextResponse.json({
    workspaceId: workspace.id,
    agentId: agent.id,
    redirectTo: `/${tenant.slug}/${workspace.slug}/dashboard`,
  });
}
