import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  approvals,
  files,
  inboxItems,
  memoryItems,
  projects,
  runtimeInstallations,
  tasks,
  tenantMemberships,
  tenants,
  users,
  workItems,
  workspaces,
  type MembershipRole,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";
import {
  discoverLocalRuntime,
  syncLocalRuntimeProfiles,
} from "../../scripts/sync-local-runtime-profiles";

const DEMO_PASSWORD = "demo-password";
const TENANT_SLUG = "atelier-lumiere";

const ids = {
  task: "10000000-0000-4000-8000-000000000001",
  approval: "10000000-0000-4000-8000-000000000002",
  fileBrief: "10000000-0000-4000-8000-000000000003",
  fileBrand: "10000000-0000-4000-8000-000000000004",
  memoryAudience: "10000000-0000-4000-8000-000000000005",
  memoryTone: "10000000-0000-4000-8000-000000000006",
  memoryRule: "10000000-0000-4000-8000-000000000007",
  memoryStack: "10000000-0000-4000-8000-000000000008",
  project: "10000000-0000-4000-8000-000000000009",
  workBacklog: "10000000-0000-4000-8000-000000000010",
  workTodo: "10000000-0000-4000-8000-000000000011",
  workProgress: "10000000-0000-4000-8000-000000000012",
  workReview: "10000000-0000-4000-8000-000000000013",
  inbox: "10000000-0000-4000-8000-000000000014",
};

async function upsertUser(input: {
  email: string;
  name: string;
  role: MembershipRole;
}) {
  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash: hashPassword(DEMO_PASSWORD),
      name: input.name,
      onboardedAt: new Date(),
      onboardingData: { organizationName: "Atelier Lumière", agentTemplate: "general" },
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        passwordHash: hashPassword(DEMO_PASSWORD),
        name: input.name,
        onboardedAt: new Date(),
      },
    })
    .returning();
  return { ...input, user };
}

async function seed() {
  const runtime = await discoverLocalRuntime();
  const [owner, member, viewer] = await Promise.all([
    upsertUser({ email: "owner@atelier-lumiere.local", name: "Alice Owner", role: "owner" }),
    upsertUser({ email: "member@atelier-lumiere.local", name: "Marc Member", role: "member" }),
    upsertUser({ email: "viewer@atelier-lumiere.local", name: "Violette Viewer", role: "viewer" }),
  ]);

  const [tenant] = await db
    .insert(tenants)
    .values({ name: "Atelier Lumière", slug: TENANT_SLUG, ownerUserId: owner.user.id })
    .onConflictDoUpdate({
      target: tenants.slug,
      set: { name: "Atelier Lumière", ownerUserId: owner.user.id },
    })
    .returning();

  for (const entry of [owner, member, viewer]) {
    await db
      .insert(tenantMemberships)
      .values({ tenantId: tenant.id, userId: entry.user.id, role: entry.role })
      .onConflictDoUpdate({
        target: [tenantMemberships.tenantId, tenantMemberships.userId],
        set: { role: entry.role },
      });
  }

  let [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.tenantId, tenant.id))
    .limit(1);
  if (workspace) {
    [workspace] = await db
      .update(workspaces)
      .set({
        name: tenant.name,
        slug: tenant.slug,
        hermesBaseUrl: runtime.gatewayUrl,
        permissions: DEFAULT_PERMISSIONS,
      })
      .where(eq(workspaces.id, workspace.id))
      .returning();
  } else {
    [workspace] = await db
      .insert(workspaces)
      .values({
        tenantId: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        hermesBaseUrl: runtime.gatewayUrl,
        permissions: DEFAULT_PERMISSIONS,
      })
      .returning();
  }

  const [installation] = await db
    .insert(runtimeInstallations)
    .values({
      tenantId: tenant.id,
      name: "Hermes Docker local",
      installationKey: runtime.installationKey,
      origin: "local_managed",
      managementLevel: "managed",
      transport: "direct",
      gatewayUrl: runtime.gatewayUrl,
      status: "checking",
      createdByUserId: owner.user.id,
    })
    .onConflictDoUpdate({
      target: [runtimeInstallations.tenantId, runtimeInstallations.installationKey],
      set: {
        name: "Hermes Docker local",
        gatewayUrl: runtime.gatewayUrl,
        status: "checking",
        statusReason: null,
        statusDetail: "Synchronisation des profils Hermes en cours.",
        archivedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  async function upsertAgent(input: { slug: string; name: string; description: string; profile: string }) {
    const [existing] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.workspaceId, workspace.id), eq(agents.slug, input.slug)))
      .limit(1);
    if (existing) {
      const [updated] = await db
        .update(agents)
        .set({
          runtimeInstallationId: installation.id,
          name: input.name,
          description: input.description,
          hermesProfileName: input.profile,
          runtimeState: "setup_required",
          runtimeError: "Synchronisation du profil Hermes en cours.",
          updatedAt: new Date(),
        })
        .where(eq(agents.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(agents)
      .values({
        workspaceId: workspace.id,
        runtimeInstallationId: installation.id,
        slug: input.slug,
        name: input.name,
        description: input.description,
        hermesProfileName: input.profile,
        runtimeState: "setup_required",
        runtimeError: "Synchronisation du profil Hermes en cours.",
        createdByUserId: owner.user.id,
      })
      .returning();
    return created;
  }

  const principal = await upsertAgent({
    slug: "assistant-principal",
    name: "Assistant principal",
    description: "Pilote les demandes opérationnelles de l’Atelier Lumière.",
    profile: "atelier-lumiere-principal",
  });
  await upsertAgent({
    slug: "reviewer",
    name: "Reviewer",
    description: "Vérifie les livrables avant validation humaine.",
    profile: "atelier-lumiere-reviewer",
  });

  await db
    .insert(projects)
    .values({
      id: ids.project,
      workspaceId: workspace.id,
      key: "SITE",
      name: "Refonte du site vitrine",
      description: "Préparer et livrer le nouveau site de l’Atelier Lumière.",
      status: "active",
      leadUserId: member.user.id,
    })
    .onConflictDoUpdate({
      target: projects.id,
      set: { status: "active", leadUserId: member.user.id, updatedAt: new Date() },
    });

  const seededWork = [
    { id: ids.workBacklog, number: 1, key: "ATL-1", title: "Collecter les références visuelles", status: "backlog" as const, priority: "low" as const },
    { id: ids.workTodo, number: 2, key: "ATL-2", title: "Rédiger la page À propos", status: "todo" as const, priority: "medium" as const },
    { id: ids.workProgress, number: 3, key: "ATL-3", title: "Produire la maquette de la home", status: "in_progress" as const, priority: "high" as const },
    { id: ids.workReview, number: 4, key: "ATL-4", title: "Valider le plan de lancement", status: "review" as const, priority: "urgent" as const },
  ];
  for (const item of seededWork) {
    await db
      .insert(workItems)
      .values({
        ...item,
        workspaceId: workspace.id,
        projectId: ids.project,
        description: `Donnée de démonstration RBAC pour ${item.key}.`,
        creatorUserId: member.user.id,
        assigneeType: "agent",
        assigneeAgentId: principal.id,
        reviewPolicy: item.status === "review" ? "required" : "optional",
      })
      .onConflictDoUpdate({
        target: workItems.id,
        set: { status: item.status, priority: item.priority, updatedAt: new Date() },
      });
  }

  await db
    .insert(tasks)
    .values({
      id: ids.task,
      workspaceId: workspace.id,
      title: "Autoriser l’envoi de la newsletter",
      kind: "email",
      status: "waiting_approval",
      input: "Valider le contenu avant tout envoi externe.",
    })
    .onConflictDoUpdate({ target: tasks.id, set: { status: "waiting_approval", updatedAt: new Date() } });
  await db
    .insert(approvals)
    .values({
      id: ids.approval,
      workspaceId: workspace.id,
      taskId: ids.task,
      agentId: principal.id,
      actionType: "send_email",
      payload: { recipients: 840, campaign: "Lancement été" },
      status: "pending",
    })
    .onConflictDoUpdate({ target: approvals.id, set: { status: "pending", decidedAt: null, decidedByUserId: null } });

  const memories = [
    [ids.memoryAudience, "La clientèle principale est composée de particuliers et d’architectes."],
    [ids.memoryTone, "Le ton éditorial doit rester chaleureux, précis et sans jargon."],
    [ids.memoryRule, "Aucune publication ou campagne ne part sans validation humaine."],
    [ids.memoryStack, "Le site vitrine est construit avec Next.js et hébergé en Europe."],
  ] as const;
  for (const [id, content] of memories) {
    await db
      .insert(memoryItems)
      .values({ id, workspaceId: workspace.id, content, source: "seed:atelier-lumiere" })
      .onConflictDoUpdate({ target: memoryItems.id, set: { content } });
  }

  await db
    .insert(files)
    .values([
      { id: ids.fileBrief, workspaceId: workspace.id, name: "brief-site.pdf", storedPath: "seed/atelier-lumiere/brief-site.pdf", size: 284_000, mimeType: "application/pdf" },
      { id: ids.fileBrand, workspaceId: workspace.id, name: "charte-marque.md", storedPath: "seed/atelier-lumiere/charte-marque.md", size: 8_400, mimeType: "text/markdown" },
    ])
    .onConflictDoNothing();

  await db
    .insert(inboxItems)
    .values({
      id: ids.inbox,
      workspaceId: workspace.id,
      userId: member.user.id,
      type: "review_required",
      sourceType: "work_item",
      sourceId: ids.workReview,
      reason: "Le plan de lancement attend votre revue.",
    })
    .onConflictDoUpdate({ target: inboxItems.id, set: { readAt: null } });

  await syncLocalRuntimeProfiles(runtime);

  if (runtime.installationKey !== "atelier-local") {
    await db.update(runtimeInstallations).set({
      status: "revoked",
      statusReason: "legacy_demo_installation",
      statusDetail: `Remplacée par l’installation Docker ${runtime.installationKey}.`,
      archivedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(runtimeInstallations.tenantId, tenant.id),
      eq(runtimeInstallations.installationKey, "atelier-local"),
    ));
  }

  console.log("Seeded tenant-only demo organization Atelier Lumière.");
  console.log(`Runtime Docker: ${runtime.installationKey} via ${runtime.gatewayUrl}`);
  console.log(`Owner: owner@atelier-lumiere.local / ${DEMO_PASSWORD}`);
  console.log(`Member: member@atelier-lumiere.local / ${DEMO_PASSWORD}`);
  console.log(`Viewer: viewer@atelier-lumiere.local / ${DEMO_PASSWORD}`);
  console.log(`URL: /${TENANT_SLUG}/dashboard`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
