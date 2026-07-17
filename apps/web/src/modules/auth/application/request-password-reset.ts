import { randomBytes } from "node:crypto";
import { AuthApplicationError } from "../domain/auth-errors";
import type { MailerPort, PasswordResetRepository } from "./ports";
import { hashResetToken, RESET_TOKEN_TTL_MS } from "./reset-token";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RequestPasswordResetInput = { email?: unknown };

export function createRequestPasswordReset(dependencies: {
  repository: PasswordResetRepository;
  mailer: MailerPort;
  consoleUrl: string;
}) {
  return async function requestPasswordReset(input: RequestPasswordResetInput) {
    if (typeof input.email !== "string" || !EMAIL_REGEX.test(input.email.trim())) {
      throw new AuthApplicationError(400, "L'adresse email n'est pas valide.");
    }
    const email = input.email.trim().toLowerCase();
    const user = await dependencies.repository.findUserByEmail(email);
    // Always answer ok, whether the account exists or not (no enumeration).
    if (user) {
      const token = randomBytes(32).toString("base64url");
      await dependencies.repository.deleteUserResetTokens(user.id);
      await dependencies.repository.createResetToken({
        userId: user.id,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      });
      const resetUrl = `${dependencies.consoleUrl}/reset-password?token=${token}`;
      await dependencies.mailer.send({
        to: email,
        subject: "Réinitialisation de votre mot de passe Hermes Console",
        text: [
          "Bonjour,",
          "",
          "Une réinitialisation du mot de passe de votre compte Hermes Console a été demandée.",
          "Pour définir un nouveau mot de passe, ouvrez ce lien (valide 1 heure) :",
          resetUrl,
          "",
          "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.",
        ].join("\n"),
      });
    }
    return { ok: true as const };
  };
}
