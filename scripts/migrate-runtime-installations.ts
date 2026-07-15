import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const gatewayUrl = process.env.HERMES_DEFAULT_GATEWAY_URL?.trim() || "http://127.0.0.1:8787";
const installationKey = process.env.HERMES_DEFAULT_INSTALLATION_ID?.trim() || "local-default";
const installationName = process.env.HERMES_DEFAULT_INSTALLATION_NAME?.trim() || "Hermes local";

async function migrate() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS runtime_installations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        installation_key text NOT NULL,
        origin text NOT NULL,
        management_level text NOT NULL,
        transport text NOT NULL DEFAULT 'direct',
        gateway_url text NOT NULL,
        status text NOT NULL DEFAULT 'unknown',
        status_detail text,
        status_reason text,
        gateway_protocol_version integer,
        hermes_version text,
        detected_runtime text NOT NULL DEFAULT 'unknown',
        provider text,
        provider_resource_id text,
        region text,
        capabilities jsonb,
        last_seen_at timestamptz,
        archived_at timestamptz,
        created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS runtime_installations_tenant_key_uidx
        ON runtime_installations(tenant_id, installation_key);
      CREATE INDEX IF NOT EXISTS runtime_installations_tenant_status_idx
        ON runtime_installations(tenant_id, status);
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS runtime_installation_id uuid
        REFERENCES runtime_installations(id) ON DELETE RESTRICT;
      ALTER TABLE runtime_installations ADD COLUMN IF NOT EXISTS status_reason text;
      ALTER TABLE runtime_installations ADD COLUMN IF NOT EXISTS gateway_protocol_version integer;
      ALTER TABLE runtime_installations ADD COLUMN IF NOT EXISTS hermes_version text;
      ALTER TABLE runtime_installations ADD COLUMN IF NOT EXISTS detected_runtime text NOT NULL DEFAULT 'unknown';
      ALTER TABLE runtime_installations ADD COLUMN IF NOT EXISTS provider text;
      ALTER TABLE runtime_installations ADD COLUMN IF NOT EXISTS provider_resource_id text;
      ALTER TABLE runtime_installations ADD COLUMN IF NOT EXISTS region text;
      ALTER TABLE runtime_installations ADD COLUMN IF NOT EXISTS archived_at timestamptz;
      ALTER TABLE runtime_installations ALTER COLUMN status SET DEFAULT 'checking';
      UPDATE runtime_installations SET status = 'checking' WHERE status IN ('unknown', 'connecting');
      UPDATE runtime_installations SET status = 'degraded' WHERE status = 'error';

      CREATE TABLE IF NOT EXISTS runtime_identities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        installation_id uuid NOT NULL REFERENCES runtime_installations(id) ON DELETE CASCADE,
        public_key text NOT NULL,
        fingerprint text NOT NULL,
        certificate_pem text,
        status text NOT NULL DEFAULT 'active',
        expires_at timestamptz,
        rotated_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS runtime_identities_fingerprint_uidx
        ON runtime_identities(fingerprint);
      CREATE INDEX IF NOT EXISTS runtime_identities_installation_status_idx
        ON runtime_identities(installation_id, status);

      CREATE TABLE IF NOT EXISTS runtime_enrollment_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        installation_id uuid NOT NULL REFERENCES runtime_installations(id) ON DELETE CASCADE,
        token_hash text NOT NULL,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz,
        revoked_at timestamptz,
        created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS runtime_enrollment_tokens_hash_uidx
        ON runtime_enrollment_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS runtime_enrollment_tokens_installation_idx
        ON runtime_enrollment_tokens(installation_id, expires_at);

      CREATE TABLE IF NOT EXISTS runtime_capabilities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        installation_id uuid NOT NULL REFERENCES runtime_installations(id) ON DELETE CASCADE,
        protocol_version integer NOT NULL,
        features jsonb NOT NULL DEFAULT '[]'::jsonb,
        lifecycle jsonb NOT NULL DEFAULT '[]'::jsonb,
        profiles jsonb NOT NULL DEFAULT '[]'::jsonb,
        limits jsonb,
        negotiated_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS runtime_capabilities_installation_uidx
        ON runtime_capabilities(installation_id);

      CREATE TABLE IF NOT EXISTS runtime_operations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        installation_id uuid NOT NULL REFERENCES runtime_installations(id) ON DELETE CASCADE,
        workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
        type text NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        source_version text,
        target_version text,
        steps jsonb NOT NULL DEFAULT '[]'::jsonb,
        error_code text,
        error_message text,
        backup_id uuid,
        initiated_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        started_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS runtime_operations_installation_created_idx
        ON runtime_operations(installation_id, created_at);

      CREATE TABLE IF NOT EXISTS runtime_budgets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        installation_id uuid NOT NULL REFERENCES runtime_installations(id) ON DELETE CASCADE,
        currency text NOT NULL DEFAULT 'EUR',
        period text NOT NULL DEFAULT 'monthly',
        infrastructure_limit_micros bigint,
        inference_limit_micros bigint,
        global_limit_micros bigint,
        alert_threshold_percent integer NOT NULL DEFAULT 80,
        soft_cap_action text NOT NULL DEFAULT 'alert',
        hard_cap_action text NOT NULL DEFAULT 'owner_approval',
        fallback_model text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS runtime_budgets_installation_uidx
        ON runtime_budgets(installation_id);
      ALTER TABLE runtime_budgets ADD COLUMN IF NOT EXISTS fallback_model text;

      CREATE TABLE IF NOT EXISTS runtime_usage_samples (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        installation_id uuid NOT NULL REFERENCES runtime_installations(id) ON DELETE CASCADE,
        cpu_percent_basis_points integer,
        memory_used_bytes bigint,
        memory_total_bytes bigint,
        disk_used_bytes bigint,
        disk_total_bytes bigint,
        profile_count integer,
        active_session_count integer,
        heavy_loads jsonb,
        infrastructure_cost_micros bigint,
        inference_cost_micros bigint,
        cost_currency text,
        cost_source text,
        confidence text,
        sampled_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS runtime_usage_samples_installation_sampled_idx
        ON runtime_usage_samples(installation_id, sampled_at);
      ALTER TABLE runtime_usage_samples ADD COLUMN IF NOT EXISTS cost_currency text;

      CREATE TABLE IF NOT EXISTS runtime_backups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        installation_id uuid NOT NULL REFERENCES runtime_installations(id) ON DELETE CASCADE,
        profile_name text NOT NULL DEFAULT 'default',
        status text NOT NULL DEFAULT 'queued',
        encrypted boolean NOT NULL DEFAULT true,
        storage_ref text,
        checksum_sha256 text,
        size_bytes bigint,
        retention_until timestamptz,
        secrets_policy text NOT NULL DEFAULT 'excluded',
        verified_at timestamptz,
        restored_at timestamptz,
        created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS runtime_backups_installation_created_idx
        ON runtime_backups(installation_id, created_at);
      ALTER TABLE runtime_backups ADD COLUMN IF NOT EXISTS profile_name text NOT NULL DEFAULT 'default';
    `);

    const tenants = await tx<{ id: string; owner_user_id: string }[]>`
      SELECT id, owner_user_id FROM tenants ORDER BY created_at
    `;
    for (const tenant of tenants) {
      await tx`
        INSERT INTO runtime_installations (
          tenant_id,
          name,
          installation_key,
          origin,
          management_level,
          transport,
          gateway_url,
          status,
          created_by_user_id
        ) VALUES (
          ${tenant.id},
          ${installationName},
          ${installationKey},
          'local_managed',
          'managed',
          'direct',
          ${gatewayUrl},
          'checking',
          ${tenant.owner_user_id}
        )
        ON CONFLICT (tenant_id, installation_key) DO UPDATE
        SET gateway_url = EXCLUDED.gateway_url, updated_at = now()
      `;
    }

    await tx`
      UPDATE agents AS agent
      SET runtime_installation_id = installation.id
      FROM workspaces AS workspace
      INNER JOIN runtime_installations AS installation
        ON installation.tenant_id = workspace.tenant_id
        AND installation.installation_key = ${installationKey}
      WHERE agent.workspace_id = workspace.id
        AND agent.runtime_installation_id IS NULL
    `;

    await tx.unsafe(`
      ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_hermes_profile_name_unique;
      DROP INDEX IF EXISTS agents_hermes_profile_name_unique;
      CREATE UNIQUE INDEX IF NOT EXISTS agents_installation_profile_uidx
        ON agents(runtime_installation_id, hermes_profile_name);
    `);
  });
  console.log("Runtime installations migration complete.");
}

migrate()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error(error);
    await sql.end();
    process.exit(1);
  });
