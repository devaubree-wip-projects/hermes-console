import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  createAuthSession,
  destroyAuthSession,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { getConsoleDestinationForUser } from "@/lib/workspace";
import type { AuthRepository, PasswordService, SessionCookiePort } from "../application/ports";

export const drizzleAuthRepository: AuthRepository = {
  async findUserByEmail(email) {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user ?? null;
  },
  async saveDevelopmentUser(input) {
    const [user] = await db.insert(users).values(input).onConflictDoUpdate({
      target: users.email,
      set: { passwordHash: input.passwordHash },
    }).returning();
    return user;
  },
  async createUser(input) {
    const [user] = await db.insert(users).values(input).returning();
    return user;
  },
  createSession: createAuthSession,
  consoleDestination: getConsoleDestinationForUser,
};

export const passwordService: PasswordService = { hash: hashPassword, verify: verifyPassword };
export const sessionCookieAdapter: SessionCookiePort = {
  set: setSessionCookie,
  destroy: destroyAuthSession,
};
