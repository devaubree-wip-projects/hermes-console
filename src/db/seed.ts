import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, memoryItems, runtimeInstallations, tenantMemberships, tenants, users, workspaces } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

const DEMO_EMAIL = "demo@hermes.local";

async function seed() {
  const existing = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (existing.length > 0) {
    console.log("Seed already applied (demo user exists), skipping.");
    return;
  }

  const [user] = await db
    .insert(users)
    .values({
      email: DEMO_EMAIL,
      passwordHash: hashPassword("demo-password"),
      name: "Client démo",
      onboardedAt: new Date(),
      onboardingData: {
        organizationName: "Garage Dupont",
        workspaceName: "Marketing local",
        agentTemplate: "general",
      },
    })
    .returning();

  const [tenant] = await db
    .insert(tenants)
    .values({ name: "Garage Dupont", slug: "garage-dupont", ownerUserId: user.id })
    .returning();
  await db.insert(tenantMemberships).values({ tenantId: tenant.id, userId: user.id, role: "owner" });

  const [workspace] = await db
    .insert(workspaces)
    .values({
      tenantId: tenant.id,
      name: "Marketing local",
      slug: "marketing-local",
      hermesBaseUrl: process.env.HERMES_DEFAULT_GATEWAY_URL ?? "http://127.0.0.1:8787",
      permissions: DEFAULT_PERMISSIONS,
    })
    .returning();

  const [installation] = await db.insert(runtimeInstallations).values({
    tenantId: tenant.id,
    name: "Hermes local",
    installationKey: "local-default",
    origin: "local_managed",
    managementLevel: "managed",
    transport: "direct",
    gatewayUrl: process.env.HERMES_DEFAULT_GATEWAY_URL ?? "http://127.0.0.1:8787",
    status: "ready",
    createdByUserId: user.id,
  }).returning();

  await db.insert(agents).values({
    workspaceId: workspace.id,
    runtimeInstallationId: installation.id,
    slug: "assistant-principal",
    name: "Assistant principal",
    description: "Agent Hermes principal du Garage Dupont",
    hermesProfileName: "default",
    runtimeState: "ready",
    createdByUserId: user.id,
  });

  await db.insert(memoryItems).values(
    [
      "L'entreprise cible les particuliers dans le Nord.",
      "Le ton marketing doit rester professionnel.",
      "Le site principal est sous WordPress.",
      "Le client ne veut pas publier sans validation.",
    ].map((content) => ({ workspaceId: workspace.id, content, source: "seed" })),
  );

  console.log(`Seeded demo user ${DEMO_EMAIL} (password: demo-password), workspace "${workspace.name}".`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
