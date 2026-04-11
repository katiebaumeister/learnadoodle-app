-- Fix OAuth callback failure:
-- postgrest.exceptions.APIError: permission denied for table google_drive_credentials (42501)
--
-- This migration is defensive:
-- 1) Grants table privileges needed by authenticated/service_role clients.
-- 2) Adds user-scoped RLS policies when user_id exists.
--
-- If the table does not exist in an environment, this migration no-ops.

DO $$
BEGIN
  IF to_regclass('public.google_drive_credentials') IS NULL THEN
    RAISE NOTICE 'Skipping: public.google_drive_credentials does not exist';
    RETURN;
  END IF;

  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.google_drive_credentials TO authenticated';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.google_drive_credentials TO service_role';
END
$$;

DO $$
DECLARE
  has_user_id boolean;
BEGIN
  IF to_regclass('public.google_drive_credentials') IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'google_drive_credentials'
      AND column_name = 'user_id'
  ) INTO has_user_id;

  IF NOT has_user_id THEN
    RAISE NOTICE 'Skipping RLS policy creation: user_id column missing on public.google_drive_credentials';
    RETURN;
  END IF;

  ALTER TABLE public.google_drive_credentials ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS gdc_select_own ON public.google_drive_credentials;
  DROP POLICY IF EXISTS gdc_insert_own ON public.google_drive_credentials;
  DROP POLICY IF EXISTS gdc_update_own ON public.google_drive_credentials;
  DROP POLICY IF EXISTS gdc_delete_own ON public.google_drive_credentials;

  CREATE POLICY gdc_select_own
    ON public.google_drive_credentials
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

  CREATE POLICY gdc_insert_own
    ON public.google_drive_credentials
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY gdc_update_own
    ON public.google_drive_credentials
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY gdc_delete_own
    ON public.google_drive_credentials
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
END
$$;
