-- Prevent event_revisions inserts from failing when user_id does not exist
-- in public.users (seen as: event_revisions_user_id_fkey violations).
--
-- Strategy:
-- 1) Ensure user_id is nullable.
-- 2) Add a BEFORE INSERT/UPDATE trigger that nulls NEW.user_id when the id
--    is not present in public.users.
--
-- This preserves audit rows while avoiding hard failures during event writes.

DO $$
BEGIN
  IF to_regclass('public.event_revisions') IS NULL THEN
    RAISE NOTICE 'Skipping: public.event_revisions does not exist';
    RETURN;
  END IF;

  -- If user_id was declared NOT NULL, relax it so fallback-to-NULL is possible.
  BEGIN
    ALTER TABLE public.event_revisions
      ALTER COLUMN user_id DROP NOT NULL;
  EXCEPTION
    WHEN undefined_column THEN
      RAISE NOTICE 'Skipping: event_revisions.user_id does not exist';
      RETURN;
  END;
END
$$;

CREATE OR REPLACE FUNCTION public.event_revisions_normalize_user_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Nothing to validate.
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- If users table exists and the id is missing, clear user_id to avoid FK failure.
  IF to_regclass('public.users') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = NEW.user_id
    ) THEN
      NEW.user_id := NULL;
    END IF;
  ELSE
    -- No users table to validate against; clear user_id to stay safe.
    NEW.user_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.event_revisions') IS NULL THEN
    RETURN;
  END IF;

  DROP TRIGGER IF EXISTS trg_event_revisions_normalize_user_id ON public.event_revisions;

  CREATE TRIGGER trg_event_revisions_normalize_user_id
  BEFORE INSERT OR UPDATE OF user_id
  ON public.event_revisions
  FOR EACH ROW
  EXECUTE FUNCTION public.event_revisions_normalize_user_id();
END
$$;
