-- Runtime DDL that drizzle schema.ts cannot express, extracted from
-- scripts/migrate-work-control-plane.ts so fresh installs provisioned via
-- `bun run db:migrate` reach parity with push+scripts databases:
--   * notify_hermes_work_change: pg_notify fan-out feeding the SSE work-stream
--   * reject_work_dependency_cycle: anti-cycle / cross-workspace guard
CREATE FUNCTION public.notify_hermes_work_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
      $$;
--> statement-breakpoint
CREATE FUNCTION public.reject_work_dependency_cycle() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
      $$;
--> statement-breakpoint
CREATE TRIGGER inbox_items_notify_change AFTER INSERT OR DELETE OR UPDATE ON public.inbox_items FOR EACH ROW EXECUTE FUNCTION public.notify_hermes_work_change();
--> statement-breakpoint
CREATE TRIGGER work_automation_runs_notify_change AFTER INSERT OR DELETE OR UPDATE ON public.work_automation_runs FOR EACH ROW EXECUTE FUNCTION public.notify_hermes_work_change();
--> statement-breakpoint
CREATE TRIGGER work_automations_notify_change AFTER INSERT OR DELETE OR UPDATE ON public.work_automations FOR EACH ROW EXECUTE FUNCTION public.notify_hermes_work_change();
--> statement-breakpoint
CREATE TRIGGER work_interventions_notify_change AFTER INSERT OR DELETE OR UPDATE ON public.work_interventions FOR EACH ROW EXECUTE FUNCTION public.notify_hermes_work_change();
--> statement-breakpoint
CREATE TRIGGER work_item_comments_notify_change AFTER INSERT OR DELETE OR UPDATE ON public.work_item_comments FOR EACH ROW EXECUTE FUNCTION public.notify_hermes_work_change();
--> statement-breakpoint
CREATE TRIGGER work_item_dependencies_notify_change AFTER INSERT OR DELETE OR UPDATE ON public.work_item_dependencies FOR EACH ROW EXECUTE FUNCTION public.notify_hermes_work_change();
--> statement-breakpoint
CREATE TRIGGER work_item_dependencies_reject_cycle BEFORE INSERT OR UPDATE ON public.work_item_dependencies FOR EACH ROW EXECUTE FUNCTION public.reject_work_dependency_cycle();
--> statement-breakpoint
CREATE TRIGGER work_item_label_links_notify_change AFTER INSERT OR DELETE OR UPDATE ON public.work_item_label_links FOR EACH ROW EXECUTE FUNCTION public.notify_hermes_work_change();
--> statement-breakpoint
CREATE TRIGGER work_items_notify_change AFTER INSERT OR DELETE OR UPDATE ON public.work_items FOR EACH ROW EXECUTE FUNCTION public.notify_hermes_work_change();
--> statement-breakpoint
CREATE TRIGGER work_resources_notify_change AFTER INSERT OR DELETE OR UPDATE ON public.work_resources FOR EACH ROW EXECUTE FUNCTION public.notify_hermes_work_change();
--> statement-breakpoint
CREATE TRIGGER work_run_events_notify_change AFTER INSERT OR DELETE OR UPDATE ON public.work_run_events FOR EACH ROW EXECUTE FUNCTION public.notify_hermes_work_change();
--> statement-breakpoint
CREATE TRIGGER work_run_plan_revisions_notify_change AFTER INSERT OR DELETE OR UPDATE ON public.work_run_plan_revisions FOR EACH ROW EXECUTE FUNCTION public.notify_hermes_work_change();
--> statement-breakpoint
CREATE TRIGGER work_run_plan_steps_notify_change AFTER INSERT OR DELETE OR UPDATE ON public.work_run_plan_steps FOR EACH ROW EXECUTE FUNCTION public.notify_hermes_work_change();
--> statement-breakpoint
CREATE TRIGGER work_runs_notify_change AFTER INSERT OR DELETE OR UPDATE ON public.work_runs FOR EACH ROW EXECUTE FUNCTION public.notify_hermes_work_change();
