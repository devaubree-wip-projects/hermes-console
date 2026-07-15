import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { hermesProfileName, toSlug } from "../src/lib/slugs";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function uniqueSlug(base: string, used: Set<string>) {
  for (let index = 1; index < 1000; index += 1) {
    const suffix = index === 1 ? "" : `-${index}`;
    const value = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    if (!used.has(value)) {
      used.add(value);
      return value;
    }
  }
  throw new Error("slug allocation exhausted");
}

async function migrate() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_data jsonb;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug text;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS slug text;
    `);

    const tenantRows = await tx<{ id: string; name: string; slug: string | null }[]>`
      SELECT id, name, slug FROM tenants ORDER BY created_at
    `;
    const tenantSlugs = new Set(tenantRows.flatMap((row) => row.slug ? [row.slug] : []));
    for (const tenant of tenantRows) {
      if (tenant.slug) continue;
      const slug = await uniqueSlug(toSlug(tenant.name, "organisation"), tenantSlugs);
      await tx`UPDATE tenants SET slug = ${slug} WHERE id = ${tenant.id}`;
      tenant.slug = slug;
    }

    const workspaceRows = await tx<{ id: string; tenant_id: string; name: string; slug: string | null }[]>`
      SELECT id, tenant_id, name, slug FROM workspaces ORDER BY created_at
    `;
    for (const tenant of tenantRows) {
      const used = new Set(
        workspaceRows
          .filter((workspace) => workspace.tenant_id === tenant.id && workspace.slug)
          .map((workspace) => workspace.slug as string),
      );
      for (const workspace of workspaceRows.filter((row) => row.tenant_id === tenant.id)) {
        if (workspace.slug) continue;
        const slug = await uniqueSlug(toSlug(workspace.name, "workspace"), used);
        await tx`UPDATE workspaces SET slug = ${slug} WHERE id = ${workspace.id}`;
        workspace.slug = slug;
      }
    }

    await tx.unsafe(`
      ALTER TABLE tenants ALTER COLUMN slug SET NOT NULL;
      ALTER TABLE workspaces ALTER COLUMN slug SET NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_uidx ON tenants(slug);
      CREATE UNIQUE INDEX IF NOT EXISTS workspaces_tenant_slug_uidx ON workspaces(tenant_id, slug);

      CREATE TABLE IF NOT EXISTS tenant_memberships (
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS workspace_memberships (
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role text,
        denied boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS agents (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        slug text NOT NULL,
        name text NOT NULL,
        description text,
        hermes_profile_name text NOT NULL UNIQUE,
        runtime_state text NOT NULL DEFAULT 'setup_required',
        runtime_error text,
        created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS agents_workspace_slug_uidx ON agents(workspace_id, slug);
      CREATE TABLE IF NOT EXISTS agent_sessions (
        id uuid PRIMARY KEY,
        agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        hermes_session_id text NOT NULL,
        title text,
        created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_activity_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS agent_sessions_agent_hermes_uidx ON agent_sessions(agent_id, hermes_session_id);
      CREATE INDEX IF NOT EXISTS agent_sessions_agent_activity_idx ON agent_sessions(agent_id, last_activity_at);

      ALTER TABLE xulux_threads ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS xulux_threads_workspace_agent_updated_idx
        ON xulux_threads(workspace_id, agent_id, updated_at);

      ALTER TABLE approvals ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id) ON DELETE CASCADE;
      ALTER TABLE approvals ADD COLUMN IF NOT EXISTS agent_session_id uuid REFERENCES agent_sessions(id) ON DELETE SET NULL;
      ALTER TABLE approvals ADD COLUMN IF NOT EXISTS hermes_request_id text;
      ALTER TABLE approvals ADD COLUMN IF NOT EXISTS decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

      CREATE TABLE IF NOT EXISTS audit_events (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
        actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        action text NOT NULL,
        target_type text NOT NULL,
        target_id text,
        metadata jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS audit_events_workspace_created_idx ON audit_events(workspace_id, created_at);

      ALTER TABLE agents ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE agent_sessions ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE audit_events ALTER COLUMN id SET DEFAULT gen_random_uuid();
    `);

    await tx.unsafe(`
      INSERT INTO tenant_memberships (tenant_id, user_id, role)
      SELECT id, owner_user_id, 'owner' FROM tenants
      ON CONFLICT (tenant_id, user_id) DO NOTHING;

      UPDATE users
      SET onboarded_at = COALESCE(onboarded_at, created_at)
      WHERE EXISTS (
        SELECT 1
        FROM tenants
        INNER JOIN workspaces ON workspaces.tenant_id = tenants.id
        LEFT JOIN tenant_memberships ON tenant_memberships.tenant_id = tenants.id
        WHERE tenants.owner_user_id = users.id OR tenant_memberships.user_id = users.id
      );
    `);

    const existingAgents = await tx<{ workspace_id: string; hermes_profile_name: string }[]>`
      SELECT workspace_id, hermes_profile_name FROM agents
    `;
    const usedProfiles = new Set(existingAgents.map((agent) => agent.hermes_profile_name));
    for (const workspace of workspaceRows) {
      if (existingAgents.some((agent) => agent.workspace_id === workspace.id)) continue;
      const tenant = tenantRows.find((row) => row.id === workspace.tenant_id)!;
      const owner = await tx<{ owner_user_id: string }[]>`SELECT owner_user_id FROM tenants WHERE id = ${tenant.id}`;
      const agentSlug = "assistant-principal";
      let profile = usedProfiles.size === 0 && !usedProfiles.has("default")
        ? "default"
        : hermesProfileName(tenant.slug!, workspace.slug!, agentSlug);
      profile = await uniqueSlug(profile, usedProfiles);
      await tx`
        INSERT INTO agents (id, workspace_id, slug, name, description, hermes_profile_name, runtime_state, created_by_user_id)
        VALUES (${randomUUID()}, ${workspace.id}, ${agentSlug}, ${"Assistant principal"}, ${"Agent migré depuis le chat existant"}, ${profile}, ${profile === "default" ? "ready" : "setup_required"}, ${owner[0].owner_user_id})
      `;
    }

    await tx.unsafe(`
      UPDATE xulux_threads AS thread
      SET agent_id = (
        SELECT agent.id
        FROM agents AS agent
        WHERE agent.workspace_id = thread.workspace_id
        ORDER BY agent.created_at ASC
        LIMIT 1
      )
      WHERE thread.agent_id IS NULL
        AND EXISTS (
          SELECT 1 FROM agents AS agent
          WHERE agent.workspace_id = thread.workspace_id
        );
    `);
  });
  console.log("Product model migration complete.");
}

migrate()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error(error);
    await sql.end();
    process.exit(1);
  });
