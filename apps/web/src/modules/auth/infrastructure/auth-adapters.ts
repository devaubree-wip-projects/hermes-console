import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authSessions, passwordResetTokens, users } from "@/db/schema";
import {
  createAuthSession,
  destroyAuthSession,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { sendMail } from "@/lib/mailer";
import { getConsoleDestinationForUser } from "@/lib/workspace";
import type {
  AuthRepository,
  MailerPort,
  PasswordResetRepository,
  PasswordService,
  SessionCookiePort,
} from "../application/ports";

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

export const drizzlePasswordResetRepository: PasswordResetRepository = {
  findUserByEmail: drizzleAuthRepository.findUserByEmail,
  async deleteUserResetTokens(userId) {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  },
  async createResetToken(input) {
    await db.insert(passwordResetTokens).values(input);
  },
  async findResetToken(tokenHash) {
    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  },
  async markResetTokenUsed(id) {
    await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, id));
  },
  async updateUserPassword(userId, passwordHash) {
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  },
  async deleteUserSessions(userId) {
    await db.delete(authSessions).where(eq(authSessions.userId, userId));
  },
};

export const passwordService: PasswordService = { hash: hashPassword, verify: verifyPassword };
export const sessionCookieAdapter: SessionCookiePort = {
  set: setSessionCookie,
  destroy: destroyAuthSession,
};
export const mailerAdapter: MailerPort = { send: sendMail };
