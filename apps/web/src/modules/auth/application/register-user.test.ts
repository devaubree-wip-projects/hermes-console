import { describe, expect, test } from "bun:test";
import { AuthApplicationError } from "../domain/auth-errors";
import { createRegisterUser } from "./register-user";
import type { AuthRepository, PasswordService, SessionCookiePort } from "./ports";

// La Console mutualisée porte les données de plusieurs entreprises. L'inscription
// n'y est donc pas un formulaire ouvert : elle prouve qu'on était attendu.

function harness(options: {
  invitations?: string[];
  operators?: string[];
  existingEmails?: string[];
}) {
  const created: string[] = [];
  const repository = {
    async findUserByEmail(email: string) {
      return options.existingEmails?.includes(email)
        ? ({ id: "u1", email, name: "Déjà là", passwordHash: "x" } as never)
        : null;
    },
    async hasPendingInvitation(email: string) {
      return (options.invitations ?? []).includes(email);
    },
    async createUser(input: { email: string }) {
      created.push(input.email);
      return { id: "u2", ...input } as never;
    },
    async createSession() {
      return { token: "t", expiresAt: new Date(Date.now() + 1000) };
    },
    async saveDevelopmentUser() {
      throw new Error("hors sujet ici");
    },
    async consoleDestination() {
      return "/";
    },
  } as unknown as AuthRepository;

  const passwords: PasswordService = { hash: () => "hashed", verify: () => true };
  const sessions: SessionCookiePort = { set: async () => {}, destroy: async () => {} };

  const register = createRegisterUser({
    repository,
    passwords,
    sessions,
    isOperatorEmail: (email) => (options.operators ?? []).includes(email),
  });

  return { register, created };
}

const valide = {
  name: "Camille Martin",
  email: "camille@client.fr",
  password: "un-mot-de-passe",
  acceptTerms: true,
};

describe("inscription sur invitation", () => {
  test("refuse une inscription spontanée", async () => {
    const { register, created } = harness({});
    const erreur = (await register(valide).catch((e) => e)) as AuthApplicationError;
    expect(erreur).toBeInstanceOf(AuthApplicationError);
    expect(erreur.status).toBe(403);
    // Le compte ne doit pas exister à moitié : rien n'est écrit avant le refus.
    expect(created).toEqual([]);
  });

  test("laisse entrer une adresse invitée", async () => {
    const { register, created } = harness({ invitations: ["camille@client.fr"] });
    await expect(register(valide)).resolves.toEqual({ ok: true, redirectTo: "/onboarding" });
    expect(created).toEqual(["camille@client.fr"]);
  });

  test("laisse entrer l'opérateur, qui n'a personne pour l'inviter", async () => {
    const { register } = harness({ operators: ["camille@client.fr"] });
    await expect(register(valide)).resolves.toEqual({ ok: true, redirectTo: "/onboarding" });
  });

  test("normalise l'adresse avant de chercher l'invitation", async () => {
    const { register } = harness({ invitations: ["camille@client.fr"] });
    await expect(
      register({ ...valide, email: "  Camille@Client.FR " }),
    ).resolves.toEqual({ ok: true, redirectTo: "/onboarding" });
  });

  test("un compte existant est signalé comme tel, pas comme non invité", async () => {
    // Sinon une adresse déjà inscrite mais non invitée recevrait un 403
    // trompeur, et son propriétaire chercherait une invitation inutile.
    const { register } = harness({ existingEmails: ["camille@client.fr"] });
    const erreur = (await register(valide).catch((e) => e)) as AuthApplicationError;
    expect(erreur.status).toBe(409);
  });

  test("les règles de forme priment sur l'invitation", async () => {
    const { register } = harness({ invitations: ["camille@client.fr"] });
    const erreur = (await register({ ...valide, password: "court" }).catch(
      (e) => e,
    )) as AuthApplicationError;
    expect(erreur.status).toBe(400);
  });
});
