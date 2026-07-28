import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";

// `demo-password` est documenté publiquement dans le repo : sur une instance
// déployée, poser SEED_DEMO_PASSWORD évite de créer des comptes dont le mot de
// passe est connu de tous. Le défaut reste inchangé pour le développement local.
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD?.trim() || "demo-password";

// Deux comptes nus, sans organisation. `POST /api/onboarding/complete` est le seul
// chemin qui crée un tenant, un workspace, une installation runtime et un premier
// agent — et il refuse (409) un utilisateur qui possède déjà un workspace. Seeder
// ces lignes ici enverrait l'owner droit sur son dashboard et rendrait l'onboarding
// intestable. Le member rejoint l'organisation par invitation, comme un collègue.
const ACCOUNTS = [
  { email: "owner@atelier-lumiere.local", name: "Alice Owner" },
  { email: "member@atelier-lumiere.local", name: "Marc Member" },
] as const;

async function seed() {
  for (const account of ACCOUNTS) {
    await db
      .insert(users)
      .values({
        email: account.email,
        passwordHash: hashPassword(DEMO_PASSWORD),
        name: account.name,
      })
      .onConflictDoUpdate({
        target: users.email,
        // `onboardedAt` n'est pas réécrit : le remettre à null sur une base déjà
        // passée par l'onboarding mentirait sur l'état réel du compte, alors que
        // la seule chose qu'une relance doit garantir est de pouvoir se connecter.
        set: { passwordHash: hashPassword(DEMO_PASSWORD), name: account.name },
      });
  }

  console.log(`Comptes de démonstration (mot de passe ${DEMO_PASSWORD}) :`);
  for (const account of ACCOUNTS) console.log(`  ${account.email}`);
  console.log("");
  console.log("Aucune organisation n'est créée : connectez-vous en owner, /onboarding");
  console.log("crée l'organisation et le premier agent. Invitez ensuite le member depuis");
  console.log("Réglages › Membres — le mail arrive dans Mailpit (http://localhost:8025).");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
