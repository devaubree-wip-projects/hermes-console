import { AuthApplicationError } from "../domain/auth-errors";
import type { AuthRepository, PasswordService, SessionCookiePort } from "./ports";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RegisterInput = { name?: unknown; email?: unknown; password?: unknown };

export function createRegisterUser(dependencies: {
  repository: AuthRepository;
  passwords: PasswordService;
  sessions: SessionCookiePort;
}) {
  return async function registerUser(input: RegisterInput) {
    if (typeof input.name !== "string" || !input.name.trim()) {
      throw new AuthApplicationError(400, "Le nom est requis.");
    }
    if (input.name.trim().length > 100) {
      throw new AuthApplicationError(400, "Le nom ne doit pas dépasser 100 caractères.");
    }
    if (typeof input.email !== "string" || !EMAIL_REGEX.test(input.email.trim())) {
      throw new AuthApplicationError(400, "L'adresse email n'est pas valide.");
    }
    if (typeof input.password !== "string" || input.password.length < 8) {
      throw new AuthApplicationError(400, "Le mot de passe doit contenir au moins 8 caractères.");
    }

    const email = input.email.trim().toLowerCase();
    if (await dependencies.repository.findUserByEmail(email)) {
      throw new AuthApplicationError(409, "Un compte existe déjà avec cet email.");
    }
    const user = await dependencies.repository.createUser({
      email,
      name: input.name.trim(),
      passwordHash: dependencies.passwords.hash(input.password),
    });
    const session = await dependencies.repository.createSession(user.id);
    await dependencies.sessions.set(session.token, session.expiresAt);
    return { ok: true as const, redirectTo: "/onboarding" };
  };
}
