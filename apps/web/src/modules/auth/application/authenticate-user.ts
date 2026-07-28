import { AuthApplicationError } from "../domain/auth-errors";
import type { AuthRepository, PasswordService, SessionCookiePort } from "./ports";

export type LoginInput = { email?: unknown; password?: unknown };

export function createAuthenticateUser(dependencies: {
  repository: AuthRepository;
  passwords: PasswordService;
  sessions: SessionCookiePort;
  developmentLogin: { enabled: boolean; email: string; password: string };
}) {
  return async function authenticateUser(input: LoginInput) {
    if (typeof input.email !== "string" || typeof input.password !== "string" || !input.email.trim() || !input.password) {
      throw new AuthApplicationError(401, "Identifiants invalides.");
    }

    const normalizedEmail = input.email.trim().toLowerCase();
    let user = await dependencies.repository.findUserByEmail(normalizedEmail);
    const developmentLogin = dependencies.developmentLogin;
    const isDevelopmentLogin = developmentLogin.enabled
      && normalizedEmail === developmentLogin.email
      && input.password === developmentLogin.password;

    if (isDevelopmentLogin && (!user || !dependencies.passwords.verify(input.password, user.passwordHash))) {
      user = await dependencies.repository.saveDevelopmentUser({
        email: developmentLogin.email,
        name: "Utilisateur de développement",
        passwordHash: dependencies.passwords.hash(developmentLogin.password),
      });
    }

    if (!user || !dependencies.passwords.verify(input.password, user.passwordHash)) {
      throw new AuthApplicationError(401, "Identifiants invalides.");
    }

    const session = await dependencies.repository.createSession(user.id);
    await dependencies.sessions.set(session.token, session.expiresAt);
    return { ok: true as const, redirectTo: await dependencies.repository.consoleDestination(user.id) };
  };
}
