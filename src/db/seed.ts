import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memoryItems, tenants, users, workspaces } from "@/db/schema";
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
    })
    .returning();

  const [tenant] = await db
    .insert(tenants)
    .values({ name: "Garage Dupont", ownerUserId: user.id })
    .returning();

  const [workspace] = await db
    .insert(workspaces)
    .values({
      tenantId: tenant.id,
      name: "Assistant Garage Dupont",
      hermesBaseUrl: process.env.HERMES_DEFAULT_BASE_URL ?? "http://localhost:8645/v1",
      hermesApiKey: process.env.HERMES_DEFAULT_API_KEY ?? null,
      permissions: DEFAULT_PERMISSIONS,
    })
    .returning();

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
