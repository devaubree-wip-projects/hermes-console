import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  createAuthSession,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { getConsoleDestinationForUser } from "@/lib/workspace";

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
  let user = rows[0];

  const devEmail = (process.env.HERMES_DEV_LOGIN_EMAIL ?? "demo@hermes.local").toLowerCase();
  const devPassword = process.env.HERMES_DEV_LOGIN_PASSWORD ?? "demo-password";
  const isDevelopmentLogin =
    process.env.NODE_ENV === "development" &&
    normalizedEmail === devEmail &&
    password === devPassword;

  if (isDevelopmentLogin && (!user || !verifyPassword(password, user.passwordHash))) {
    const passwordHash = hashPassword(devPassword);
    [user] = await db
      .insert(users)
      .values({
        email: devEmail,
        passwordHash,
        name: "Utilisateur de développement",
      })
      .onConflictDoUpdate({
        target: users.email,
        set: { passwordHash },
      })
      .returning();
  }

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return Response.json({ error: "Identifiants invalides." }, { status: 401 });
  }

  const { token, expiresAt } = await createAuthSession(user.id);
  await setSessionCookie(token, expiresAt);

  return Response.json({
    ok: true,
    redirectTo: await getConsoleDestinationForUser(user.id),
  });
}
