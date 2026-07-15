import { createAuthenticateUser } from "../application/authenticate-user";
import { createRegisterUser } from "../application/register-user";
import { createSignOut } from "../application/sign-out";
import { drizzleAuthRepository, passwordService, sessionCookieAdapter } from "./auth-adapters";

const developmentEmail = (process.env.HERMES_DEV_LOGIN_EMAIL ?? "demo@hermes.local").toLowerCase();

export const authenticateUser = createAuthenticateUser({
  repository: drizzleAuthRepository,
  passwords: passwordService,
  sessions: sessionCookieAdapter,
  developmentLogin: {
    enabled: process.env.NODE_ENV === "development",
    email: developmentEmail,
    password: process.env.HERMES_DEV_LOGIN_PASSWORD ?? "demo-password",
  },
});
export const registerUser = createRegisterUser({
  repository: drizzleAuthRepository,
  passwords: passwordService,
  sessions: sessionCookieAdapter,
});
export const signOut = createSignOut(sessionCookieAdapter);
