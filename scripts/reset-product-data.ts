import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function deleteHermesProfile(profile: string) {
  if (profile === "default") return;
  const process = Bun.spawn(["hermes", "profile", "delete", "-y", profile], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await process.exited;
  if (exitCode !== 0) {
    const error = await new Response(process.stderr).text();
    console.warn(`Profil Hermes ${profile} non supprimé : ${error.trim() || `code ${exitCode}`}`);
  }
}

async function reset() {
  const profiles = await sql<{ hermes_profile_name: string }[]>`
    SELECT hermes_profile_name FROM agents ORDER BY created_at DESC
  `;
  for (const { hermes_profile_name: profile } of profiles) {
    await deleteHermesProfile(profile);
  }

  await sql.unsafe("TRUNCATE TABLE users RESTART IDENTITY CASCADE");
  console.log("Données produit supprimées. La prochaine inscription démarrera sur /onboarding.");
}

reset()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error(error);
    await sql.end();
    process.exit(1);
  });
