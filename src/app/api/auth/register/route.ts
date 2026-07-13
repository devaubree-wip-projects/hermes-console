import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants, users, workspaces } from "@/db/schema";
import { createAuthSession, hashPassword, setSessionCookie } from "@/lib/auth";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { name, organization, email, password } = (body ?? {}) as {
    name?: unknown;
    organization?: unknown;
    email?: unknown;
    password?: unknown;
  };

  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Le nom est requis." }, { status: 400 });
  }
  if (name.trim().length > 100) {
    return Response.json({ error: "Le nom ne doit pas dépasser 100 caractères." }, { status: 400 });
  }
  if (typeof organization !== "string" || !organization.trim()) {
    return Response.json({ error: "Le nom de l'entreprise est requis." }, { status: 400 });
  }
  if (organization.trim().length > 100) {
    return Response.json(
      { error: "Le nom de l'entreprise ne doit pas dépasser 100 caractères." },
      { status: 400 },
    );
  }
  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    return Response.json({ error: "L'adresse email n'est pas valide." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return Response.json(
      { error: "Le mot de passe doit contenir au moins 8 caractères." },
      { status: 400 },
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existing.length > 0) {
    return Response.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
  }

  const trimmedName = name.trim();
  const trimmedOrganization = organization.trim();

  const [user] = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      name: trimmedName,
    })
    .returning();

  const [tenant] = await db
    .insert(tenants)
    .values({ name: trimmedOrganization, ownerUserId: user.id })
    .returning();

  const [workspace] = await db
    .insert(workspaces)
    .values({
      tenantId: tenant.id,
      name: `Assistant ${trimmedOrganization}`,
      hermesBaseUrl: process.env.HERMES_DEFAULT_BASE_URL ?? "http://localhost:8642/v1",
      hermesApiKey: process.env.HERMES_DEFAULT_API_KEY ?? null,
      permissions: DEFAULT_PERMISSIONS,
    })
    .returning();

  const { token, expiresAt } = await createAuthSession(user.id);
  await setSessionCookie(token, expiresAt);

  return Response.json({ ok: true, workspaceId: workspace.id });
}
