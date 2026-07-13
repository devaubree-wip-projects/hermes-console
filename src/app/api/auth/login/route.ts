import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createAuthSession, setSessionCookie, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return Response.json({ error: "Identifiants invalides." }, { status: 401 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const rows = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  const user = rows[0];

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return Response.json({ error: "Identifiants invalides." }, { status: 401 });
  }

  const { token, expiresAt } = await createAuthSession(user.id);
  await setSessionCookie(token, expiresAt);

  return Response.json({ ok: true });
}
