-- Fix Google Calendar OAuth callback failures caused by:
-- postgrest.exceptions.APIError: permission denied for table google_calendar_credentials
--
-- Defensive migration:
-- 1) Grants required table privileges to authenticated and service_role
-- 2) Enables user-scoped RLS policies when user_id column exists
--
-- Safe no-op if the table does not exist.

DO $$
BEGIN
  IF to_regclass('public.google_calendar_credentials') IS NULL THEN
    RAISE NOTICE 'Skipping: public.google_calendar_credentials does not exist';
    RETURN;
  END IF;

  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.google_calendar_credentials TO authenticated';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.google_calendar_credentials TO service_role';
END
$$;

DO $$
DECLARE
  has_user_id boolean;
BEGIN
  IF to_regclass('public.google_calendar_credentials') IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'google_calendar_credentials'
      AND column_name = 'user_id'
  ) INTO has_user_id;

  IF NOT has_user_id THEN
    RAISE NOTICE 'Skipping RLS policy creation: user_id column missing on public.google_calendar_credentials';
    RETURN;
  END IF;

  ALTER TABLE public.google_calendar_credentials ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS gcc_select_own ON public.google_calendar_credentials;
  DROP POLICY IF EXISTS gcc_insert_own ON public.google_calendar_credentials;
  DROP POLICY IF EXISTS gcc_update_own ON public.google_calendar_credentials;
  DROP POLICY IF EXISTS gcc_delete_own ON public.google_calendar_credentials;

  CREATE POLICY gcc_select_own
    ON public.google_calendar_credentials
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

  CREATE POLICY gcc_insert_own
    ON public.google_calendar_credentials
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY gcc_update_own
    ON public.google_calendar_credentials
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY gcc_delete_own
    ON public.google_calendar_credentials
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
END
$$;
