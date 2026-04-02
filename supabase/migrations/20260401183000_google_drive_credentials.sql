CREATE TABLE IF NOT EXISTS public.google_drive_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  family_id uuid NOT NULL,
  account_email text,
  access_token text NOT NULL,
  refresh_token text,
  scope jsonb DEFAULT '[]'::jsonb,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, family_id)
);

CREATE INDEX IF NOT EXISTS idx_google_drive_credentials_family_id
  ON public.google_drive_credentials (family_id);

CREATE INDEX IF NOT EXISTS idx_google_drive_credentials_user_id
  ON public.google_drive_credentials (user_id);

ALTER TABLE public.google_drive_credentials ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.google_drive_credentials_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_google_drive_credentials_updated_at ON public.google_drive_credentials;
CREATE TRIGGER trg_google_drive_credentials_updated_at
BEFORE UPDATE ON public.google_drive_credentials
FOR EACH ROW
EXECUTE PROCEDURE public.google_drive_credentials_set_updated_at();
