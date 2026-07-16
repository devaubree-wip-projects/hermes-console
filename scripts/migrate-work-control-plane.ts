import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function migrate() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS runtime_work_nonces (
        installation_id uuid NOT NULL REFERENCES runtime_installations(id) ON DELETE CASCADE,
        nonce text NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (installation_id, nonce)
      );
      CREATE INDEX IF NOT EXISTS runtime_work_nonces_expires_idx ON runtime_work_nonces(expires_at);

      CREATE TABLE IF NOT EXISTS projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        key text NOT NULL,
        name text NOT NULL,
        description text,
        status text NOT NULL DEFAULT 'planned',
        lead_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        lead_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        starts_at timestamptz,
        due_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT projects_status_check CHECK (status IN ('planned', 'active', 'paused', 'completed', 'cancelled'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS projects_workspace_key_uidx ON projects(workspace_id, key);
      CREATE INDEX IF NOT EXISTS projects_workspace_status_idx ON projects(workspace_id, status);

      CREATE TABLE IF NOT EXISTS agent_teams (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name text NOT NULL,
        slug text NOT NULL,
        description text,
        lead_agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
        delegation_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
        concurrency_limit integer NOT NULL DEFAULT 1,
        visibility text NOT NULL DEFAULT 'workspace',
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT agent_teams_concurrency_check CHECK (concurrency_limit BETWEEN 1 AND 64),
        CONSTRAINT agent_teams_visibility_check CHECK (visibility IN ('workspace', 'restricted'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS agent_teams_workspace_name_uidx ON agent_teams(workspace_id, name);
      ALTER TABLE agent_teams ADD COLUMN IF NOT EXISTS slug text;
      UPDATE agent_teams SET slug = 'team-' || substr(replace(id::text, '-', ''), 1, 12) WHERE slug IS NULL OR slug = '';
      ALTER TABLE agent_teams ALTER COLUMN slug SET NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS agent_teams_workspace_slug_uidx ON agent_teams(workspace_id, slug);

      CREATE TABLE IF NOT EXISTS agent_team_members (
        team_id uuid NOT NULL REFERENCES agent_teams(id) ON DELETE CASCADE,
        agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (team_id, agent_id)
      );

      CREATE TABLE IF NOT EXISTS work_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
        number integer NOT NULL,
        key text NOT NULL,
        title text NOT NULL,
        description text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT 'backlog',
        priority text NOT NULL DEFAULT 'none',
        creator_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        assignee_type text,
        assignee_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        assignee_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        assignee_team_id uuid REFERENCES agent_teams(id) ON DELETE SET NULL,
        parent_work_item_id uuid REFERENCES work_items(id) ON DELETE SET NULL,
        due_at timestamptz,
        review_policy text NOT NULL DEFAULT 'optional',
        legacy_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
        first_run_at timestamptz,
        completed_at timestamptz,
        cancelled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT work_items_number_check CHECK (number > 0),
        CONSTRAINT work_items_status_check CHECK (status IN ('backlog', 'todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled')),
        CONSTRAINT work_items_priority_check CHECK (priority IN ('none', 'low', 'medium', 'high', 'urgent')),
        CONSTRAINT work_items_review_policy_check CHECK (review_policy IN ('none', 'optional', 'required')),
        CONSTRAINT work_items_assignee_check CHECK (
          (assignee_type IS NULL AND assignee_user_id IS NULL AND assignee_agent_id IS NULL AND assignee_team_id IS NULL)
          OR (assignee_type = 'user' AND assignee_user_id IS NOT NULL AND assignee_agent_id IS NULL AND assignee_team_id IS NULL)
          OR (assignee_type = 'agent' AND assignee_user_id IS NULL AND assignee_agent_id IS NOT NULL AND assignee_team_id IS NULL)
          OR (assignee_type = 'team' AND assignee_user_id IS NULL AND assignee_agent_id IS NULL AND assignee_team_id IS NOT NULL)
        ),
        CONSTRAINT work_items_parent_check CHECK (parent_work_item_id IS NULL OR parent_work_item_id <> id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS work_items_workspace_number_uidx ON work_items(workspace_id, number);
      CREATE UNIQUE INDEX IF NOT EXISTS work_items_workspace_key_uidx ON work_items(workspace_id, key);
      CREATE UNIQUE INDEX IF NOT EXISTS work_items_legacy_task_uidx ON work_items(legacy_task_id) WHERE legacy_task_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS work_items_workspace_status_updated_idx ON work_items(workspace_id, status, updated_at);
      CREATE INDEX IF NOT EXISTS work_items_workspace_assignee_idx ON work_items(workspace_id, assignee_type, assignee_agent_id);

      CREATE TABLE IF NOT EXISTS work_item_labels (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name text NOT NULL,
        color text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS work_item_labels_workspace_name_uidx ON work_item_labels(workspace_id, name);

      CREATE TABLE IF NOT EXISTS work_item_label_links (
        work_item_id uuid NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        label_id uuid NOT NULL REFERENCES work_item_labels(id) ON DELETE CASCADE,
        PRIMARY KEY (work_item_id, label_id)
      );

      CREATE TABLE IF NOT EXISTS work_saved_views (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL,
        filters jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS work_saved_views_workspace_user_name_uidx
        ON work_saved_views(workspace_id, user_id, name);

      CREATE TABLE IF NOT EXISTS work_item_dependencies (
        work_item_id uuid NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        depends_on_work_item_id uuid NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (work_item_id, depends_on_work_item_id),
        CONSTRAINT work_item_dependencies_self_check CHECK (work_item_id <> depends_on_work_item_id)
      );

      CREATE OR REPLACE FUNCTION reject_work_dependency_cycle() RETURNS trigger AS $$
      BEGIN
        IF EXISTS (
          WITH RECURSIVE dependency_path(id) AS (
            SELECT NEW.depends_on_work_item_id
            UNION
            SELECT dependency.depends_on_work_item_id
            FROM work_item_dependencies dependency
            INNER JOIN dependency_path path ON dependency.work_item_id = path.id
          )
          SELECT 1 FROM dependency_path WHERE id = NEW.work_item_id
        ) THEN
          RAISE EXCEPTION 'work_dependency_cycle' USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (
          SELECT 1
          FROM work_items item
          INNER JOIN work_items dependency ON dependency.id = NEW.depends_on_work_item_id
          WHERE item.id = NEW.work_item_id
            AND item.workspace_id = dependency.workspace_id
        ) THEN
          RAISE EXCEPTION 'work_dependency_cross_workspace' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS work_item_dependencies_reject_cycle ON work_item_dependencies;
      CREATE TRIGGER work_item_dependencies_reject_cycle
        BEFORE INSERT OR UPDATE ON work_item_dependencies
        FOR EACH ROW EXECUTE FUNCTION reject_work_dependency_cycle();

      CREATE TABLE IF NOT EXISTS work_resources (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
        work_item_id uuid REFERENCES work_items(id) ON DELETE CASCADE,
        kind text NOT NULL,
        name text NOT NULL,
        uri text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT work_resources_scope_check CHECK ((project_id IS NULL) <> (work_item_id IS NULL)),
        CONSTRAINT work_resources_kind_check CHECK (kind IN ('link', 'file', 'knowledge', 'artifact'))
      );
      CREATE INDEX IF NOT EXISTS work_resources_item_created_idx ON work_resources(work_item_id, created_at);
      CREATE INDEX IF NOT EXISTS work_resources_project_created_idx ON work_resources(project_id, created_at);

      CREATE TABLE IF NOT EXISTS work_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        work_item_id uuid NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
        runtime_installation_id uuid NOT NULL REFERENCES runtime_installations(id) ON DELETE RESTRICT,
        hermes_profile_name text NOT NULL,
        trigger_type text NOT NULL,
        trigger_comment_id uuid,
        automation_id uuid,
        originator_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        parent_run_id uuid REFERENCES work_runs(id) ON DELETE SET NULL,
        status text NOT NULL DEFAULT 'queued',
        attempt integer NOT NULL DEFAULT 1,
        max_attempts integer NOT NULL DEFAULT 2,
        failure_reason text,
        claimed_by_edge_id text,
        lease_token_hash text,
        lease_expires_at timestamptz,
        agent_session_id uuid REFERENCES agent_sessions(id) ON DELETE SET NULL,
        hermes_session_id text,
        prompt text NOT NULL,
        context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        idempotency_key text NOT NULL,
        queued_at timestamptz NOT NULL DEFAULT now(),
        claimed_at timestamptz,
        started_at timestamptz,
        last_heartbeat_at timestamptz,
        completed_at timestamptz,
        result_summary text,
        usage jsonb,
        cost_micros bigint,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT work_runs_status_check CHECK (status IN ('queued', 'preparing', 'running', 'waiting_input', 'cancelling', 'succeeded', 'failed', 'cancelled')),
        CONSTRAINT work_runs_trigger_check CHECK (trigger_type IN ('assignment', 'mention', 'automation', 'rerun', 'api', 'delegation')),
        CONSTRAINT work_runs_attempt_check CHECK (attempt > 0 AND max_attempts > 0 AND attempt <= max_attempts)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS work_runs_workspace_idempotency_uidx ON work_runs(workspace_id, idempotency_key);
      CREATE INDEX IF NOT EXISTS work_runs_installation_queue_idx ON work_runs(runtime_installation_id, status, queued_at);
      CREATE INDEX IF NOT EXISTS work_runs_item_created_idx ON work_runs(work_item_id, created_at);
      CREATE INDEX IF NOT EXISTS work_runs_lease_idx ON work_runs(status, lease_expires_at);

      CREATE TABLE IF NOT EXISTS work_run_plan_revisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id uuid NOT NULL REFERENCES work_runs(id) ON DELETE CASCADE,
        sequence integer NOT NULL,
        source_event_sequence integer NOT NULL,
        items_snapshot jsonb NOT NULL,
        active_step_id text,
        diagnostics jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT work_run_plan_revisions_sequence_check CHECK (sequence > 0 AND source_event_sequence > 0)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS work_run_plan_revisions_run_sequence_uidx ON work_run_plan_revisions(run_id, sequence);
      CREATE UNIQUE INDEX IF NOT EXISTS work_run_plan_revisions_run_event_uidx ON work_run_plan_revisions(run_id, source_event_sequence);
      ALTER TABLE work_run_plan_revisions
        ADD COLUMN IF NOT EXISTS diagnostics jsonb NOT NULL DEFAULT '[]'::jsonb;

      CREATE TABLE IF NOT EXISTS work_run_plan_steps (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id uuid NOT NULL REFERENCES work_runs(id) ON DELETE CASCADE,
        hermes_step_id text NOT NULL,
        position integer NOT NULL,
        content text NOT NULL,
        status text NOT NULL,
        first_seen_revision_id uuid NOT NULL REFERENCES work_run_plan_revisions(id) ON DELETE RESTRICT,
        last_seen_revision_id uuid NOT NULL REFERENCES work_run_plan_revisions(id) ON DELETE RESTRICT,
        promoted_work_item_id uuid REFERENCES work_items(id) ON DELETE SET NULL,
        delegated_run_id uuid REFERENCES work_runs(id) ON DELETE SET NULL,
        started_at timestamptz,
        completed_at timestamptz,
        cancelled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT work_run_plan_steps_position_check CHECK (position >= 0),
        CONSTRAINT work_run_plan_steps_status_check CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS work_run_plan_steps_run_hermes_uidx ON work_run_plan_steps(run_id, hermes_step_id);

      CREATE TABLE IF NOT EXISTS work_run_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id uuid NOT NULL REFERENCES work_runs(id) ON DELETE CASCADE,
        sequence integer NOT NULL,
        type text NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        visibility text NOT NULL DEFAULT 'workspace',
        occurred_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT work_run_events_sequence_check CHECK (sequence > 0),
        CONSTRAINT work_run_events_visibility_check CHECK (visibility IN ('workspace', 'internal'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS work_run_events_run_sequence_uidx ON work_run_events(run_id, sequence);
      CREATE INDEX IF NOT EXISTS work_run_events_run_created_idx ON work_run_events(run_id, created_at);

      CREATE TABLE IF NOT EXISTS work_item_comments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        work_item_id uuid NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        author_type text NOT NULL,
        author_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        author_agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
        source_run_id uuid REFERENCES work_runs(id) ON DELETE SET NULL,
        content text NOT NULL,
        edited_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT work_item_comments_author_check CHECK (
          (author_type = 'user' AND author_user_id IS NOT NULL AND author_agent_id IS NULL)
          OR (author_type = 'agent' AND author_user_id IS NULL AND author_agent_id IS NOT NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS work_item_comments_item_created_idx ON work_item_comments(work_item_id, created_at);
      ALTER TABLE work_item_comments DROP CONSTRAINT IF EXISTS work_item_comments_author_user_id_fkey;
      ALTER TABLE work_item_comments
        ADD CONSTRAINT work_item_comments_author_user_id_fkey
        FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE;
      ALTER TABLE work_item_comments DROP CONSTRAINT IF EXISTS work_item_comments_author_agent_id_fkey;
      ALTER TABLE work_item_comments
        ADD CONSTRAINT work_item_comments_author_agent_id_fkey
        FOREIGN KEY (author_agent_id) REFERENCES agents(id) ON DELETE CASCADE;

      CREATE TABLE IF NOT EXISTS work_interventions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        work_item_id uuid NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        run_id uuid NOT NULL REFERENCES work_runs(id) ON DELETE CASCADE,
        agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
        agent_session_id uuid REFERENCES agent_sessions(id) ON DELETE SET NULL,
        hermes_request_id text NOT NULL,
        type text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        prompt text NOT NULL,
        safe_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        decided_at timestamptz,
        expires_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT work_interventions_type_check CHECK (type IN ('approval', 'clarification', 'sudo', 'secret', 'launch_review', 'deliverable_review')),
        CONSTRAINT work_interventions_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'answered', 'expired', 'cancelled'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS work_interventions_run_request_uidx ON work_interventions(run_id, hermes_request_id);
      CREATE INDEX IF NOT EXISTS work_interventions_workspace_status_idx ON work_interventions(workspace_id, status, created_at);

      CREATE TABLE IF NOT EXISTS work_automations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
        name text NOT NULL,
        status text NOT NULL DEFAULT 'inactive',
        trigger_type text NOT NULL,
        trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
        timezone text NOT NULL DEFAULT 'UTC',
        work_item_template jsonb NOT NULL,
        assignee_type text NOT NULL,
        assignee_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        assignee_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
        assignee_team_id uuid REFERENCES agent_teams(id) ON DELETE SET NULL,
        dedupe_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
        concurrency_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
        last_triggered_at timestamptz,
        next_trigger_at timestamptz,
        created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT work_automations_status_check CHECK (status IN ('active', 'inactive', 'error')),
        CONSTRAINT work_automations_trigger_check CHECK (trigger_type IN ('cron', 'webhook', 'event', 'manual')),
        CONSTRAINT work_automations_assignee_check CHECK (
          (assignee_type = 'user' AND assignee_user_id IS NOT NULL AND assignee_agent_id IS NULL AND assignee_team_id IS NULL)
          OR (assignee_type = 'agent' AND assignee_user_id IS NULL AND assignee_agent_id IS NOT NULL AND assignee_team_id IS NULL)
          OR (assignee_type = 'team' AND assignee_user_id IS NULL AND assignee_agent_id IS NULL AND assignee_team_id IS NOT NULL)
        )
      );
      CREATE UNIQUE INDEX IF NOT EXISTS work_automations_workspace_name_uidx ON work_automations(workspace_id, name);

      CREATE TABLE IF NOT EXISTS work_automation_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        automation_id uuid NOT NULL REFERENCES work_automations(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        trigger_type text NOT NULL,
        idempotency_key text NOT NULL,
        status text NOT NULL DEFAULT 'running',
        work_item_id uuid REFERENCES work_items(id) ON DELETE SET NULL,
        safe_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        error_code text,
        started_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        CONSTRAINT work_automation_runs_trigger_check CHECK (trigger_type IN ('cron', 'webhook', 'event', 'manual')),
        CONSTRAINT work_automation_runs_status_check CHECK (status IN ('running', 'succeeded', 'failed', 'deduplicated'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS work_automation_runs_automation_key_uidx
        ON work_automation_runs(automation_id, idempotency_key);
      CREATE INDEX IF NOT EXISTS work_automation_runs_workspace_started_idx
        ON work_automation_runs(workspace_id, started_at);

      CREATE TABLE IF NOT EXISTS inbox_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type text NOT NULL,
        source_type text NOT NULL,
        source_id text NOT NULL,
        reason text NOT NULL,
        read_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS inbox_items_user_source_uidx ON inbox_items(user_id, type, source_type, source_id);
      CREATE INDEX IF NOT EXISTS inbox_items_user_read_created_idx ON inbox_items(user_id, read_at, created_at);

      CREATE OR REPLACE FUNCTION notify_hermes_work_change() RETURNS trigger AS $$
      DECLARE
        changed_work_item_id uuid;
        changed_workspace_id uuid;
        changed_run_id uuid;
      BEGIN
        IF TG_TABLE_NAME = 'work_items' THEN
          changed_work_item_id := COALESCE(NEW.id, OLD.id);
          changed_workspace_id := COALESCE(NEW.workspace_id, OLD.workspace_id);
        ELSIF TG_TABLE_NAME = 'work_runs' THEN
          changed_work_item_id := COALESCE(NEW.work_item_id, OLD.work_item_id);
          changed_workspace_id := COALESCE(NEW.workspace_id, OLD.workspace_id);
        ELSIF TG_TABLE_NAME = 'work_interventions' THEN
          changed_work_item_id := COALESCE(NEW.work_item_id, OLD.work_item_id);
          changed_workspace_id := COALESCE(NEW.workspace_id, OLD.workspace_id);
        ELSIF TG_TABLE_NAME = 'work_item_comments' THEN
          changed_work_item_id := COALESCE(NEW.work_item_id, OLD.work_item_id);
          SELECT workspace_id INTO changed_workspace_id FROM work_items WHERE id = changed_work_item_id;
        ELSIF TG_TABLE_NAME = 'work_item_dependencies' THEN
          changed_work_item_id := COALESCE(NEW.work_item_id, OLD.work_item_id);
          SELECT workspace_id INTO changed_workspace_id FROM work_items WHERE id = changed_work_item_id;
        ELSIF TG_TABLE_NAME = 'work_item_label_links' THEN
          changed_work_item_id := COALESCE(NEW.work_item_id, OLD.work_item_id);
          SELECT workspace_id INTO changed_workspace_id FROM work_items WHERE id = changed_work_item_id;
        ELSIF TG_TABLE_NAME = 'work_resources' THEN
          changed_work_item_id := COALESCE(NEW.work_item_id, OLD.work_item_id);
          changed_workspace_id := COALESCE(NEW.workspace_id, OLD.workspace_id);
        ELSIF TG_TABLE_NAME = 'inbox_items' THEN
          changed_workspace_id := COALESCE(NEW.workspace_id, OLD.workspace_id);
        ELSIF TG_TABLE_NAME = 'work_automations' THEN
          changed_workspace_id := COALESCE(NEW.workspace_id, OLD.workspace_id);
        ELSIF TG_TABLE_NAME = 'work_automation_runs' THEN
          changed_work_item_id := COALESCE(NEW.work_item_id, OLD.work_item_id);
          changed_workspace_id := COALESCE(NEW.workspace_id, OLD.workspace_id);
        ELSE
          changed_run_id := COALESCE(NEW.run_id, OLD.run_id);
          SELECT work_item_id, workspace_id INTO changed_work_item_id, changed_workspace_id
          FROM work_runs WHERE id = changed_run_id;
        END IF;
        IF changed_workspace_id IS NOT NULL THEN
          PERFORM pg_notify('hermes_work_changed', json_build_object(
            'workspaceId', changed_workspace_id,
            'workItemId', changed_work_item_id,
            'source', TG_TABLE_NAME
          )::text);
        END IF;
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS work_items_notify_change ON work_items;
      CREATE TRIGGER work_items_notify_change AFTER INSERT OR UPDATE OR DELETE ON work_items
        FOR EACH ROW EXECUTE FUNCTION notify_hermes_work_change();
      DROP TRIGGER IF EXISTS work_runs_notify_change ON work_runs;
      CREATE TRIGGER work_runs_notify_change AFTER INSERT OR UPDATE OR DELETE ON work_runs
        FOR EACH ROW EXECUTE FUNCTION notify_hermes_work_change();
      DROP TRIGGER IF EXISTS work_run_events_notify_change ON work_run_events;
      CREATE TRIGGER work_run_events_notify_change AFTER INSERT OR UPDATE OR DELETE ON work_run_events
        FOR EACH ROW EXECUTE FUNCTION notify_hermes_work_change();
      DROP TRIGGER IF EXISTS work_run_plan_revisions_notify_change ON work_run_plan_revisions;
      CREATE TRIGGER work_run_plan_revisions_notify_change AFTER INSERT OR UPDATE OR DELETE ON work_run_plan_revisions
        FOR EACH ROW EXECUTE FUNCTION notify_hermes_work_change();
      DROP TRIGGER IF EXISTS work_run_plan_steps_notify_change ON work_run_plan_steps;
      CREATE TRIGGER work_run_plan_steps_notify_change AFTER INSERT OR UPDATE OR DELETE ON work_run_plan_steps
        FOR EACH ROW EXECUTE FUNCTION notify_hermes_work_change();
      DROP TRIGGER IF EXISTS work_interventions_notify_change ON work_interventions;
      CREATE TRIGGER work_interventions_notify_change AFTER INSERT OR UPDATE OR DELETE ON work_interventions
        FOR EACH ROW EXECUTE FUNCTION notify_hermes_work_change();
      DROP TRIGGER IF EXISTS work_item_comments_notify_change ON work_item_comments;
      CREATE TRIGGER work_item_comments_notify_change AFTER INSERT OR UPDATE OR DELETE ON work_item_comments
        FOR EACH ROW EXECUTE FUNCTION notify_hermes_work_change();
      DROP TRIGGER IF EXISTS work_item_dependencies_notify_change ON work_item_dependencies;
      CREATE TRIGGER work_item_dependencies_notify_change AFTER INSERT OR UPDATE OR DELETE ON work_item_dependencies
        FOR EACH ROW EXECUTE FUNCTION notify_hermes_work_change();
      DROP TRIGGER IF EXISTS work_item_label_links_notify_change ON work_item_label_links;
      CREATE TRIGGER work_item_label_links_notify_change AFTER INSERT OR UPDATE OR DELETE ON work_item_label_links
        FOR EACH ROW EXECUTE FUNCTION notify_hermes_work_change();
      DROP TRIGGER IF EXISTS work_resources_notify_change ON work_resources;
      CREATE TRIGGER work_resources_notify_change AFTER INSERT OR UPDATE OR DELETE ON work_resources
        FOR EACH ROW EXECUTE FUNCTION notify_hermes_work_change();
      DROP TRIGGER IF EXISTS inbox_items_notify_change ON inbox_items;
      CREATE TRIGGER inbox_items_notify_change AFTER INSERT OR UPDATE OR DELETE ON inbox_items
        FOR EACH ROW EXECUTE FUNCTION notify_hermes_work_change();
      DROP TRIGGER IF EXISTS work_automations_notify_change ON work_automations;
      CREATE TRIGGER work_automations_notify_change AFTER INSERT OR UPDATE OR DELETE ON work_automations
        FOR EACH ROW EXECUTE FUNCTION notify_hermes_work_change();
      DROP TRIGGER IF EXISTS work_automation_runs_notify_change ON work_automation_runs;
      CREATE TRIGGER work_automation_runs_notify_change AFTER INSERT OR UPDATE OR DELETE ON work_automation_runs
        FOR EACH ROW EXECUTE FUNCTION notify_hermes_work_change();
    `);

    await tx.unsafe(`
      WITH missing AS (
        SELECT
          task.*,
          workspace.slug AS workspace_slug,
          tenant.owner_user_id
        FROM tasks AS task
        INNER JOIN workspaces AS workspace ON workspace.id = task.workspace_id
        INNER JOIN tenants AS tenant ON tenant.id = workspace.tenant_id
        LEFT JOIN work_items AS existing ON existing.legacy_task_id = task.id
        WHERE existing.id IS NULL
      ), legacy AS (
        SELECT
          missing.*,
          COALESCE((SELECT max(existing.number) FROM work_items AS existing WHERE existing.workspace_id = missing.workspace_id), 0)
            + row_number() OVER (PARTITION BY missing.workspace_id ORDER BY missing.created_at, missing.id) AS item_number
        FROM missing
      )
      INSERT INTO work_items (
        workspace_id, number, key, title, description, status, priority,
        creator_user_id, legacy_task_id, first_run_at, completed_at, created_at, updated_at
      )
      SELECT
        workspace_id,
        item_number,
        COALESCE(NULLIF(upper(left(regexp_replace(workspace_slug, '[^a-zA-Z0-9]', '', 'g'), 5)), ''), 'WORK') || '-' || item_number,
        title,
        input,
        CASE status
          WHEN 'draft' THEN 'backlog'
          WHEN 'waiting_approval' THEN 'blocked'
          WHEN 'running' THEN 'in_progress'
          WHEN 'done' THEN 'done'
          WHEN 'failed' THEN 'blocked'
          ELSE 'backlog'
        END,
        'none',
        owner_user_id,
        id,
        CASE WHEN status IN ('running', 'done', 'failed') THEN created_at END,
        CASE WHEN status = 'done' THEN updated_at END,
        created_at,
        updated_at
      FROM legacy
      ON CONFLICT DO NOTHING;
    `);
  });

  const [counts] = await sql<{
    legacy_tasks: number;
    migrated_tasks: number;
    runs: number;
  }[]>`
    SELECT
      (SELECT count(*)::int FROM tasks) AS legacy_tasks,
      (SELECT count(*)::int FROM work_items WHERE legacy_task_id IS NOT NULL) AS migrated_tasks,
      (SELECT count(*)::int FROM work_runs) AS runs
  `;
  console.log("Work control plane migration complete.", counts);
}

migrate()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error(error);
    await sql.end();
    process.exit(1);
  });
