-- Enforce ClassDay event invariants regardless of caller path.
-- This keeps manual create_task_event, direct inserts, and optimistic updates aligned.

CREATE OR REPLACE FUNCTION public.apply_classday_event_invariants()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.event_type, '') = 'ClassDay' THEN
    NEW.subject_id := NULL;
    NEW.counts_toward_plan := COALESCE(NEW.counts_toward_plan, TRUE);
    IF NEW.counts_toward_plan = TRUE THEN
      -- Keep PLAN_PLACEHOLDER when explicitly set by planner generation.
      NEW.instructional_status := COALESCE(NEW.instructional_status, 'MANUAL_COUNTS');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_classday_invariants_trg ON public.events;

CREATE TRIGGER events_classday_invariants_trg
BEFORE INSERT OR UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.apply_classday_event_invariants();
