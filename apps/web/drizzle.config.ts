import { defineConfig } from "drizzle-kit";
import path from "node:path";

export default defineConfig({
  schema: path.join(import.meta.dirname, "src/db/schema.ts"),
  out: path.join(import.meta.dirname, "drizzle"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
