import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function migrate() {
  // Idempotence guard: the unique index is created by this migration's final
  // step, so its presence means the destructive statements below (notably the
  // legacy workspace_memberships wipe) already ran and must not be replayed.
  const [{ exists: alreadyApplied }] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = 'workspaces_tenant_uidx'
    ) AS exists
  `;
  if (alreadyApplied) {
    console.log("Tenant boundary migration already applied; skipping.");
    return;
  }

  const duplicates = await sql<{ tenant_id: string; workspace_count: number }[]>`
    SELECT tenant_id, count(*)::int AS workspace_count
    FROM workspaces
    GROUP BY tenant_id
    HAVING count(*) > 1
  `;
  if (duplicates.length > 0) {
    throw new Error(
      `Tenant-only migration requires one workspace per tenant; duplicates: ${duplicates
        .map((row) => `${row.tenant_id} (${row.workspace_count})`)
        .join(", ")}`,
    );
  }

  await sql.begin(async (tx) => {
    await tx.unsafe(`
      UPDATE workspaces AS workspace
      SET slug = tenant.slug,
          name = tenant.name
      FROM tenants AS tenant
      WHERE workspace.tenant_id = tenant.id
        AND (workspace.slug <> tenant.slug OR workspace.name <> tenant.name);

      DELETE FROM workspace_memberships;

      CREATE UNIQUE INDEX IF NOT EXISTS workspaces_tenant_uidx
        ON workspaces(tenant_id);
    `);
  });

  console.log("Tenant boundary migration complete: one organization, one RBAC scope.");
}

migrate()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error(error);
    await sql.end();
    process.exit(1);
  });
