-- Create Google Calendar sync linkage/log tables used by backend pull/push flows.
-- Fixes runtime errors like:
-- postgrest.exceptions.APIError: relation "public.google_calendar_event_links" does not exist (42P01)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.google_calendar_event_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  credential_id uuid NOT NULL REFERENCES public.google_calendar_credentials(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS google_calendar_event_links_event_credential_uidx
  ON public.google_calendar_event_links (event_id, credential_id);

CREATE UNIQUE INDEX IF NOT EXISTS google_calendar_event_links_credential_google_uidx
  ON public.google_calendar_event_links (credential_id, google_event_id);

CREATE INDEX IF NOT EXISTS google_calendar_event_links_credential_idx
  ON public.google_calendar_event_links (credential_id);

CREATE INDEX IF NOT EXISTS google_calendar_event_links_google_event_idx
  ON public.google_calendar_event_links (google_event_id);

CREATE TABLE IF NOT EXISTS public.google_calendar_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid NOT NULL REFERENCES public.google_calendar_credentials(id) ON DELETE CASCADE,
  status text NOT NULL,
  message text,
  inserted_events integer NOT NULL DEFAULT 0,
  updated_events integer NOT NULL DEFAULT 0,
  skipped_events integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS google_calendar_sync_log_credential_idx
  ON public.google_calendar_sync_log (credential_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.google_calendar_event_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.google_calendar_event_links TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.google_calendar_sync_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.google_calendar_sync_log TO service_role;

ALTER TABLE public.google_calendar_event_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gcel_select_own ON public.google_calendar_event_links;
DROP POLICY IF EXISTS gcel_insert_own ON public.google_calendar_event_links;
DROP POLICY IF EXISTS gcel_update_own ON public.google_calendar_event_links;
DROP POLICY IF EXISTS gcel_delete_own ON public.google_calendar_event_links;

DROP POLICY IF EXISTS gcsl_select_own ON public.google_calendar_sync_log;
DROP POLICY IF EXISTS gcsl_insert_own ON public.google_calendar_sync_log;
DROP POLICY IF EXISTS gcsl_update_own ON public.google_calendar_sync_log;
DROP POLICY IF EXISTS gcsl_delete_own ON public.google_calendar_sync_log;

CREATE POLICY gcel_select_own
  ON public.google_calendar_event_links
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.google_calendar_credentials gcc
      WHERE gcc.id = credential_id
        AND gcc.user_id = auth.uid()
    )
  );

CREATE POLICY gcel_insert_own
  ON public.google_calendar_event_links
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.google_calendar_credentials gcc
      WHERE gcc.id = credential_id
        AND gcc.user_id = auth.uid()
    )
  );

CREATE POLICY gcel_update_own
  ON public.google_calendar_event_links
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.google_calendar_credentials gcc
      WHERE gcc.id = credential_id
        AND gcc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.google_calendar_credentials gcc
      WHERE gcc.id = credential_id
        AND gcc.user_id = auth.uid()
    )
  );

CREATE POLICY gcel_delete_own
  ON public.google_calendar_event_links
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.google_calendar_credentials gcc
      WHERE gcc.id = credential_id
        AND gcc.user_id = auth.uid()
    )
  );

CREATE POLICY gcsl_select_own
  ON public.google_calendar_sync_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.google_calendar_credentials gcc
      WHERE gcc.id = credential_id
        AND gcc.user_id = auth.uid()
    )
  );

CREATE POLICY gcsl_insert_own
  ON public.google_calendar_sync_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.google_calendar_credentials gcc
      WHERE gcc.id = credential_id
        AND gcc.user_id = auth.uid()
    )
  );

CREATE POLICY gcsl_update_own
  ON public.google_calendar_sync_log
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.google_calendar_credentials gcc
      WHERE gcc.id = credential_id
        AND gcc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.google_calendar_credentials gcc
      WHERE gcc.id = credential_id
        AND gcc.user_id = auth.uid()
    )
  );

CREATE POLICY gcsl_delete_own
  ON public.google_calendar_sync_log
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.google_calendar_credentials gcc
      WHERE gcc.id = credential_id
        AND gcc.user_id = auth.uid()
    )
  );
