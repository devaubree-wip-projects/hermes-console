import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  auditEvents,
  tenantMemberships,
  tenants,
  users,
  workspaces,
  runtimeInstallations,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { createHermesProfile, HermesRuntimeError } from "@/lib/hermes/server";
import { environmentRuntimeInstallationValues } from "@/lib/hermes/installations";
import { getAgentTemplate } from "@/lib/onboarding";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";
import {
  allocateAgentIdentity,
  allocateTenantSlug,
  allocateWorkspaceSlug,
} from "@/lib/product-model";
import { listWorkspacesForUser, getWorkspaceLocationForUser } from "@/lib/workspace";

function textField(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const user = await requireUser();
  const existing = await listWorkspacesForUser(user.id);
  if (existing.length > 0) {
    const location = await getWorkspaceLocationForUser(existing[0].id, user.id);
    return Response.json({
      error: "Votre espace est déjà configuré.",
      redirectTo: location
        ? `/${location.tenant.slug}/${location.workspace.slug}/dashboard`
        : "/",
    }, { status: 409 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const organizationName = textField(body?.organizationName, 100);
  const workspaceName = textField(body?.workspaceName, 100);
  const agentName = textField(body?.agentName, 80);
  const agentDescription = textField(body?.agentDescription, 500);
  const template = getAgentTemplate(textField(body?.agentTemplate, 32));

  if (!organizationName || !workspaceName || !agentName || !template) {
    return Response.json({ error: "Complétez les informations de votre espace et de votre agent." }, { status: 400 });
  }

  const tenantId = randomUUID();
  const workspaceId = randomUUID();
  const agentId = randomUUID();
  const runtimeInstallationId = randomUUID();
  const tenantSlug = await allocateTenantSlug(organizationName);
  const workspaceSlug = await allocateWorkspaceSlug(tenantId, workspaceName);
  const identity = await allocateAgentIdentity(
    workspaceId,
    tenantSlug,
    workspaceSlug,
    agentName,
  );
  const description = agentDescription || template.mission;

  await db.transaction(async (tx) => {
    await tx.insert(tenants).values({
      id: tenantId,
      name: organizationName,
      slug: tenantSlug,
      ownerUserId: user.id,
    });
    await tx.insert(tenantMemberships).values({ tenantId, userId: user.id, role: "owner" });
    await tx.insert(workspaces).values({
      id: workspaceId,
      tenantId,
      name: workspaceName,
      slug: workspaceSlug,
      hermesBaseUrl: process.env.HERMES_DEFAULT_GATEWAY_URL ?? "http://127.0.0.1:8787",
      permissions: DEFAULT_PERMISSIONS,
    });
    await tx.insert(runtimeInstallations).values({
      id: runtimeInstallationId,
      ...environmentRuntimeInstallationValues(tenantId, user.id),
    });
    await tx.insert(agents).values({
      id: agentId,
      workspaceId,
      runtimeInstallationId,
      slug: identity.slug,
      name: agentName,
      description,
      hermesProfileName: identity.profileName,
      createdByUserId: user.id,
    });
    await tx.update(users).set({
      onboardedAt: new Date(),
      onboardingData: { organizationName, workspaceName, agentTemplate: template.id },
    }).where(eq(users.id, user.id));
  });

  let runtimeState: "ready" | "setup_required" | "error" = "ready";
  let runtimeError: string | null = null;
  try {
    await createHermesProfile(
      { name: identity.profileName, description },
      { agentId, profile: identity.profileName },
    );
  } catch (error) {
    runtimeState = error instanceof HermesRuntimeError && !error.status ? "setup_required" : "error";
    runtimeError = error instanceof Error
      ? error.message.slice(0, 500)
      : "Création du profil Hermes impossible.";
  }

  await db.update(agents).set({
    runtimeState,
    runtimeError,
    updatedAt: new Date(),
  }).where(eq(agents.id, agentId));
  await db.insert(auditEvents).values({
    tenantId,
    workspaceId,
    actorUserId: user.id,
    action: "onboarding.completed",
    targetType: "agent",
    targetId: agentId,
    metadata: { profile: identity.profileName, runtimeState, template: template.id },
  });

  return Response.json({
    ok: true,
    runtimeState,
    redirectTo: `/${tenantSlug}/${workspaceSlug}/d/chat`,
  }, { status: 201 });
}
