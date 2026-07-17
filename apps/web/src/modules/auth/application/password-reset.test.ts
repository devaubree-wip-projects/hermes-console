import { describe, expect, test } from "bun:test";
import type { AuthUser } from "../domain/auth-user";
import type { MailerPort, PasswordResetRepository } from "./ports";
import { createRegisterUser } from "./register-user";
import { createRequestPasswordReset } from "./request-password-reset";
import { createResetPassword } from "./reset-password";

const USER: AuthUser = {
  id: "user-1",
  email: "alice@example.com",
  name: "Alice",
  passwordHash: "scrypt:old:hash",
};

type StoredToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

function createFakes(options?: { user?: AuthUser }) {
  const tokens: StoredToken[] = [];
  const sent: { to: string; subject: string; text: string }[] = [];
  const state = { updatedPasswordHash: null as string | null, sessionsDeletedFor: null as string | null };
  const repository: PasswordResetRepository = {
    async findUserByEmail(email) {
      return options?.user && options.user.email === email ? options.user : null;
    },
    async deleteUserResetTokens(userId) {
      for (let i = tokens.length - 1; i >= 0; i -= 1) {
        if (tokens[i].userId === userId) tokens.splice(i, 1);
      }
    },
    async createResetToken(input) {
      tokens.push({ id: `token-${tokens.length + 1}`, usedAt: null, ...input });
    },
    async findResetToken(tokenHash) {
      return tokens.find((token) => token.tokenHash === tokenHash) ?? null;
    },
    async markResetTokenUsed(id) {
      const token = tokens.find((candidate) => candidate.id === id);
      if (token) token.usedAt = new Date();
    },
    async updateUserPassword(_userId, passwordHash) {
      state.updatedPasswordHash = passwordHash;
    },
    async deleteUserSessions(userId) {
      state.sessionsDeletedFor = userId;
    },
  };
  const mailer: MailerPort = {
    async send(input) {
      sent.push(input);
    },
  };
  return { repository, mailer, tokens, sent, state };
}

function extractToken(text: string): string {
  const match = /token=([A-Za-z0-9_-]+)/.exec(text);
  if (!match) throw new Error("no token in mail body");
  return match[1];
}

describe("requestPasswordReset", () => {
  test("rejects an invalid email", async () => {
    const fakes = createFakes();
    const requestPasswordReset = createRequestPasswordReset({
      repository: fakes.repository,
      mailer: fakes.mailer,
      consoleUrl: "http://console.test",
    });
    await expect(requestPasswordReset({ email: "not-an-email" })).rejects.toThrow(/valide/);
  });

  test("answers ok without sending anything for an unknown account", async () => {
    const fakes = createFakes();
    const requestPasswordReset = createRequestPasswordReset({
      repository: fakes.repository,
      mailer: fakes.mailer,
      consoleUrl: "http://console.test",
    });
    const result = await requestPasswordReset({ email: "nobody@example.com" });
    expect(result.ok).toBe(true);
    expect(fakes.sent).toHaveLength(0);
    expect(fakes.tokens).toHaveLength(0);
  });

  test("stores only a hash and mails a reset link for a known account", async () => {
    const fakes = createFakes({ user: USER });
    const requestPasswordReset = createRequestPasswordReset({
      repository: fakes.repository,
      mailer: fakes.mailer,
      consoleUrl: "http://console.test",
    });
    const result = await requestPasswordReset({ email: "Alice@Example.com " });
    expect(result.ok).toBe(true);
    expect(fakes.sent).toHaveLength(1);
    expect(fakes.sent[0].to).toBe(USER.email);
    expect(fakes.sent[0].text).toContain("http://console.test/reset-password?token=");
    expect(fakes.tokens).toHaveLength(1);
    const rawToken = extractToken(fakes.sent[0].text);
    expect(fakes.tokens[0].tokenHash).not.toBe(rawToken);
    expect(fakes.tokens[0].userId).toBe(USER.id);
    expect(fakes.tokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test("replaces previous reset tokens for the same account", async () => {
    const fakes = createFakes({ user: USER });
    const requestPasswordReset = createRequestPasswordReset({
      repository: fakes.repository,
      mailer: fakes.mailer,
      consoleUrl: "http://console.test",
    });
    await requestPasswordReset({ email: USER.email });
    await requestPasswordReset({ email: USER.email });
    expect(fakes.tokens).toHaveLength(1);
    expect(fakes.sent).toHaveLength(2);
  });
});

describe("resetPassword", () => {
  async function issueToken(fakes: ReturnType<typeof createFakes>) {
    const requestPasswordReset = createRequestPasswordReset({
      repository: fakes.repository,
      mailer: fakes.mailer,
      consoleUrl: "http://console.test",
    });
    await requestPasswordReset({ email: USER.email });
    return extractToken(fakes.sent[fakes.sent.length - 1].text);
  }

  function buildResetPassword(fakes: ReturnType<typeof createFakes>) {
    return createResetPassword({
      repository: fakes.repository,
      passwords: {
        hash: (password) => `hashed:${password}`,
        verify: () => true,
      },
    });
  }

  test("updates the password, burns the token and revokes sessions", async () => {
    const fakes = createFakes({ user: USER });
    const token = await issueToken(fakes);
    const resetPassword = buildResetPassword(fakes);
    const result = await resetPassword({ token, password: "new-password-123" });
    expect(result.ok).toBe(true);
    expect(fakes.state.updatedPasswordHash).toBe("hashed:new-password-123");
    expect(fakes.tokens[0].usedAt).not.toBeNull();
    expect(fakes.state.sessionsDeletedFor).toBe(USER.id);
  });

  test("rejects an unknown token", async () => {
    const fakes = createFakes({ user: USER });
    const resetPassword = buildResetPassword(fakes);
    await expect(
      resetPassword({ token: "unknown-token", password: "new-password-123" }),
    ).rejects.toThrow(/invalide ou expiré/);
  });

  test("rejects an expired token", async () => {
    const fakes = createFakes({ user: USER });
    const token = await issueToken(fakes);
    fakes.tokens[0].expiresAt = new Date(Date.now() - 1000);
    const resetPassword = buildResetPassword(fakes);
    await expect(
      resetPassword({ token, password: "new-password-123" }),
    ).rejects.toThrow(/invalide ou expiré/);
  });

  test("rejects a token that was already used", async () => {
    const fakes = createFakes({ user: USER });
    const token = await issueToken(fakes);
    const resetPassword = buildResetPassword(fakes);
    await resetPassword({ token, password: "new-password-123" });
    await expect(
      resetPassword({ token, password: "other-password-456" }),
    ).rejects.toThrow(/invalide ou expiré/);
  });

  test("rejects a too short password", async () => {
    const fakes = createFakes({ user: USER });
    const token = await issueToken(fakes);
    const resetPassword = buildResetPassword(fakes);
    await expect(resetPassword({ token, password: "short" })).rejects.toThrow(/8 caractères/);
  });
});

describe("registerUser terms acceptance", () => {
  function buildRegisterUser() {
    const created: { email: string }[] = [];
    const registerUser = createRegisterUser({
      repository: {
        async findUserByEmail() {
          return null;
        },
        async saveDevelopmentUser() {
          throw new Error("unused");
        },
        async createUser(input) {
          created.push({ email: input.email });
          return { id: "user-new", email: input.email, name: input.name, passwordHash: input.passwordHash };
        },
        async createSession() {
          return { token: "session-token", expiresAt: new Date(Date.now() + 1000) };
        },
        async consoleDestination() {
          return "/onboarding";
        },
      },
      passwords: { hash: (password) => `hashed:${password}`, verify: () => true },
      sessions: { set: async () => {}, destroy: async () => {} },
    });
    return { registerUser, created };
  }

  test("rejects a registration without accepted terms", async () => {
    const { registerUser, created } = buildRegisterUser();
    await expect(
      registerUser({ name: "Alice", email: "alice@example.com", password: "long-enough-1" }),
    ).rejects.toThrow(/CGU/);
    expect(created).toHaveLength(0);
  });

  test("accepts a registration with accepted terms", async () => {
    const { registerUser } = buildRegisterUser();
    const result = await registerUser({
      name: "Alice",
      email: "alice@example.com",
      password: "long-enough-1",
      acceptTerms: true,
    });
    expect(result.ok).toBe(true);
  });
});
