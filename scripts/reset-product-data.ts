import { rm } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

// Le runtime tourne sous Docker et monte ce dossier sur /opt/data
// (infra/dev/compose.yaml) : ses profils vivent ici, pas dans le HOME du binaire
// `hermes` de la machine. Les supprimer via la CLI de l'hôte ne touchait donc rien
// et laissait des profils orphelins, que le prochain onboarding récupérait déjà
// remplis dès qu'il regénérait le même nom.
const PROFILES_DIR = path.join(
  process.env.HERMES_DATA_DIR?.trim() || "data/hermes",
  "profiles",
);

// `hermesProfileName` (lib/slugs.ts) ne produit que ces caractères. La valeur
// vient de la base et sert à construire un chemin supprimé récursivement : on
// refuse tout le reste plutôt que de faire confiance à la colonne.
const PROFILE_NAME = /^[a-z0-9][a-z0-9_-]*$/;

async function deleteHermesProfile(profile: string) {
  if (profile === "default") return false;
  if (!PROFILE_NAME.test(profile)) {
    console.warn(`Profil Hermes « ${profile} » ignoré : nom inattendu.`);
    return false;
  }
  await rm(path.join(PROFILES_DIR, profile), { recursive: true, force: true });
  return true;
}

async function reset() {
  const profiles = await sql<{ hermes_profile_name: string }[]>`
    SELECT hermes_profile_name FROM agents ORDER BY created_at DESC
  `;
  let deleted = 0;
  for (const { hermes_profile_name: profile } of profiles) {
    if (await deleteHermesProfile(profile)) deleted += 1;
  }

  await sql.unsafe("TRUNCATE TABLE users RESTART IDENTITY CASCADE");
  console.log(`${deleted} profil(s) Hermes supprimé(s) dans ${PROFILES_DIR}.`);
  console.log("Données produit supprimées. La prochaine connexion démarrera sur /onboarding.");
}

reset()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error(error);
    await sql.end();
    process.exit(1);
  });
