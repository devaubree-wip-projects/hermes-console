import { lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { authSessions, passwordResetTokens, tenantInvitations } from "@/db/schema";

/**
 * Delete already-expired security artifacts so these tables don't grow without
 * bound. Only transient, already-dead rows are removed — audit history and work
 * events are never touched (their retention is a separate product decision).
 */
export async function purgeExpiredArtifacts(): Promise<{
  sessions: number;
  resetTokens: number;
  invitations: number;
}> {
  const now = new Date();
  const sessions = await db
    .delete(authSessions)
    .where(lt(authSessions.expiresAt, now))
    .returning({ token: authSessions.token });
  const resetTokens = await db
    .delete(passwordResetTokens)
    .where(or(lt(passwordResetTokens.expiresAt, now), sql`${passwordResetTokens.usedAt} is not null`))
    .returning({ id: passwordResetTokens.id });
  const invitations = await db
    .delete(tenantInvitations)
    .where(lt(tenantInvitations.expiresAt, now))
    .returning({ id: tenantInvitations.id });
  return {
    sessions: sessions.length,
    resetTokens: resetTokens.length,
    invitations: invitations.length,
  };
}
