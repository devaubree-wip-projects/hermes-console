import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function migrate() {
  const [{ exists: alreadyApplied }] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_tables WHERE tablename = 'mail_sends'
    ) AS exists
  `;
  if (alreadyApplied) {
    console.log("Mail capability migration already applied; skipping.");
    return;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS mail_credentials (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      provider text NOT NULL,
      from_email text NOT NULL,
      from_name text,
      reply_to text,
      sealed_secret text NOT NULL,
      transport jsonb,
      daily_limit integer NOT NULL DEFAULT 100,
      is_default boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS mail_credentials_tenant_provider_uidx
      ON mail_credentials (tenant_id, provider)
  `;
  // Un seul relais par défaut et par tenant : sinon le choix dépendrait de
  // l'ordre de lecture, donc le message partirait un jour du mauvais domaine.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS mail_credentials_tenant_default_uidx
      ON mail_credentials (tenant_id) WHERE is_default
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS mail_sends (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
      provider text NOT NULL,
      recipient text NOT NULL,
      subject text NOT NULL,
      source_url text NOT NULL,
      provider_message_id text,
      status text NOT NULL,
      error text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS mail_sends_tenant_recipient_idx
      ON mail_sends (tenant_id, recipient)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS mail_sends_tenant_created_idx
      ON mail_sends (tenant_id, created_at)
  `;
  // La réservation d'adresse : c'est cet index, et non la lecture qui précède
  // l'envoi, qui arbitre entre deux exécutions concurrentes du même cron.
  // Un échec libère l'adresse — on ne condamne pas un prospect pour une panne.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS mail_sends_tenant_recipient_live_uidx
      ON mail_sends (tenant_id, recipient) WHERE status <> 'failed'
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS mail_suppressions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      address text NOT NULL,
      reason text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS mail_suppressions_tenant_address_uidx
      ON mail_suppressions (tenant_id, address)
  `;

  console.log("Mail capability migration applied.");
}

await migrate()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
