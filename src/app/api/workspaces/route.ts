import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants, workspaces } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

function isValidGatewayUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 100) {
    return NextResponse.json(
      { error: "Le nom du workspace est requis (100 caractères max)." },
      { status: 400 },
    );
  }

  let hermesBaseUrl = process.env.HERMES_DEFAULT_BASE_URL ?? "http://localhost:8642/v1";
  if (typeof body?.hermesBaseUrl === "string" && body.hermesBaseUrl.trim().length > 0) {
    const candidate = body.hermesBaseUrl.trim();
    if (!isValidGatewayUrl(candidate)) {
      return NextResponse.json({ error: "URL du gateway invalide." }, { status: 400 });
    }
    hermesBaseUrl = candidate;
  }

  const [existingTenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.ownerUserId, user.id))
    .orderBy(asc(tenants.createdAt))
    .limit(1);

  const tenant =
    existingTenant ??
    (await db.insert(tenants).values({ name: user.name, ownerUserId: user.id }).returning())[0];

  const [workspace] = await db
    .insert(workspaces)
    .values({
      tenantId: tenant.id,
      name,
      hermesBaseUrl,
      permissions: DEFAULT_PERMISSIONS,
    })
    .returning();

  return NextResponse.json({ workspaceId: workspace.id });
}
