import { AuthApplicationError } from "../domain/auth-errors";
import type { PasswordResetRepository, PasswordService } from "./ports";
import { hashResetToken } from "./reset-token";

export type ResetPasswordInput = { token?: unknown; password?: unknown };

export function createResetPassword(dependencies: {
  repository: PasswordResetRepository;
  passwords: PasswordService;
}) {
  return async function resetPassword(input: ResetPasswordInput) {
    if (typeof input.token !== "string" || !input.token.trim()) {
      throw new AuthApplicationError(400, "Ce lien de réinitialisation est invalide ou expiré.");
    }
    if (typeof input.password !== "string" || input.password.length < 8) {
      throw new AuthApplicationError(400, "Le mot de passe doit contenir au moins 8 caractères.");
    }
    const record = await dependencies.repository.findResetToken(hashResetToken(input.token.trim()));
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new AuthApplicationError(400, "Ce lien de réinitialisation est invalide ou expiré.");
    }
    await dependencies.repository.markResetTokenUsed(record.id);
    await dependencies.repository.updateUserPassword(
      record.userId,
      dependencies.passwords.hash(input.password),
    );
    // A password reset invalidates every active session for the account.
    await dependencies.repository.deleteUserSessions(record.userId);
    return { ok: true as const };
  };
}
