import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenantMemberships, tenants } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

// GDPR portability (art. 20): the signed-in user downloads their own personal
// data. Deliberately scoped to account-level data (never the password hash);
// full per-tenant work-data export is a separate, larger surface.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Authentification requise." }, { status: 401 });
  }

  const memberships = await db
    .select({
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      role: tenantMemberships.role,
      joinedAt: tenantMemberships.createdAt,
    })
    .from(tenantMemberships)
    .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
    .where(eq(tenantMemberships.userId, user.id));

  const ownedTenants = await db
    .select({ name: tenants.name, slug: tenants.slug, createdAt: tenants.createdAt })
    .from(tenants)
    .where(eq(tenants.ownerUserId, user.id));

  const payload = {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      onboardedAt: user.onboardedAt,
      onboardingData: user.onboardingData,
    },
    memberships,
    ownedOrganizations: ownedTenants,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="hermes-console-export.json"',
    },
  });
}
