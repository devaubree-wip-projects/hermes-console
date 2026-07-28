import { defineConfig } from "drizzle-kit";

// Chemins relatifs au dossier de ce fichier : drizzle-kit préfixe `./` aux chemins
// qu'il reçoit, ce qu'un chemin absolu transforme en `.//home/...` introuvable.
// Lancer depuis apps/web (voir le script db:generate).
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
