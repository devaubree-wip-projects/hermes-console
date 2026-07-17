import type { AuthUser } from "../domain/auth-user";

export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUser | null>;
  saveDevelopmentUser(input: { email: string; name: string; passwordHash: string }): Promise<AuthUser>;
  createUser(input: { email: string; name: string; passwordHash: string }): Promise<AuthUser>;
  createSession(userId: string): Promise<{ token: string; expiresAt: Date }>;
  consoleDestination(userId: string): Promise<string>;
}

export interface PasswordService {
  hash(password: string): string;
  verify(password: string, stored: string): boolean;
}

export interface SessionCookiePort {
  set(token: string, expiresAt: Date): Promise<void>;
  destroy(): Promise<void>;
}

export interface PasswordResetRepository {
  findUserByEmail(email: string): Promise<AuthUser | null>;
  deleteUserResetTokens(userId: string): Promise<void>;
  createResetToken(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findResetToken(
    tokenHash: string,
  ): Promise<{ id: string; userId: string; expiresAt: Date; usedAt: Date | null } | null>;
  markResetTokenUsed(id: string): Promise<void>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
}

export interface MailerPort {
  send(input: { to: string; subject: string; text: string }): Promise<void>;
}
