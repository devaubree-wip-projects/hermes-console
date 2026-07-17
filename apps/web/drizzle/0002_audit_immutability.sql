-- Make audit_events tamper-evident: audit rows are append-only, so reject any
-- UPDATE at the database level (no application code ever updates them). DELETE is
-- intentionally left to the tenant/workspace cascade, which is GDPR-aligned
-- (erasing a tenant removes its audit trail with it).
CREATE FUNCTION public.reject_audit_event_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = '23514';
      END;
      $$;
--> statement-breakpoint
CREATE TRIGGER audit_events_reject_update BEFORE UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.reject_audit_event_mutation();
