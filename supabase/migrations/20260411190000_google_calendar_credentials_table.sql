-- Ensure Google Calendar credential storage exists in all environments.
-- This prevents OAuth callback 500s when the credentials table/constraint is missing.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.google_calendar_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES public.family(id) ON DELETE CASCADE,
  account_email text,
  access_token text,
  refresh_token text,
  scope jsonb,
  expires_at timestamptz,
  sync_token text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS google_calendar_credentials_user_family_uidx
  ON public.google_calendar_credentials (user_id, family_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.google_calendar_credentials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.google_calendar_credentials TO service_role;

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
