export const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Why an invitation cannot be accepted by the signed-in account, or null when
 * it can. The invited email must match: accepting proves control of the link,
 * membership stays bound to the invited mailbox.
 */
export function invitationAcceptError(
  invitation: { email: string; expiresAt: Date },
  userEmail: string,
  now = Date.now(),
): "expired" | "email_mismatch" | null {
  if (invitation.expiresAt.getTime() < now) return "expired";
  if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) return "email_mismatch";
  return null;
}
