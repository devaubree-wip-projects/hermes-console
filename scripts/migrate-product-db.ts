import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Applies the versioned SQL migrations from apps/web/drizzle in order and
// records them in __drizzle_migrations. This is the production path; local
// development can keep iterating with `bun run db:push`.
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

// Postgres emits a NOTICE for every foreign-key identifier longer than 63 chars.
// They are informational and drown the migration output, so they stay silenced.
const sql = postgres(url, { max: 1, onnotice: () => {} });

migrate(drizzle(sql), {
  migrationsFolder: path.join(import.meta.dirname, "../apps/web/drizzle"),
})
  .then(async () => {
    console.log("Database migrations applied.");
    await sql.end();
  })
  .catch(async (error) => {
    console.error(error);
    await sql.end();
    process.exit(1);
  });
