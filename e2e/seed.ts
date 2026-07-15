import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, tenantMemberships, tenants, users, workspaces } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

const email = "e2e@hermes.local";
const password = "e2e-password";

async function seed() {
  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    [user] = await db.insert(users).values({
      email,
      passwordHash: hashPassword(password),
      name: "Hermes E2E",
      onboardedAt: new Date(),
    }).returning();
  }

  let [tenant] = await db.select().from(tenants).where(eq(tenants.slug, "e2e")).limit(1);
  if (!tenant) {
    [tenant] = await db.insert(tenants).values({
      name: "Hermes E2E",
      slug: "e2e",
      ownerUserId: user.id,
    }).returning();
  }
  await db.insert(tenantMemberships).values({
    tenantId: tenant.id,
    userId: user.id,
    role: "owner",
  }).onConflictDoNothing();

  let [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, "e2e")).limit(1);
  if (!workspace) {
    [workspace] = await db.insert(workspaces).values({
      tenantId: tenant.id,
      name: "Hermes E2E",
      slug: "e2e",
      hermesBaseUrl: "http://127.0.0.1:9119",
      permissions: DEFAULT_PERMISSIONS,
    }).returning();
  }

  const [agent] = await db.select().from(agents).where(eq(agents.slug, "assistant-principal")).limit(1);
  if (!agent || agent.workspaceId !== workspace.id) {
    await db.insert(agents).values({
      workspaceId: workspace.id,
      slug: "assistant-principal",
      name: "Assistant principal",
      description: "Agent déterministe pour les tests du composer",
      hermesProfileName: "default",
      runtimeState: "ready",
      createdByUserId: user.id,
    }).onConflictDoNothing();
  }
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
