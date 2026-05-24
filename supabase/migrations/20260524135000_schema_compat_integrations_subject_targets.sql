-- Compatibility migration for production environments that are missing:
-- 1) public.calendar_integrations table expected by integrations routes
-- 2) public.academic_years.subject_targets column referenced by older queries

CREATE TABLE IF NOT EXISTS public.calendar_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.family(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'apple', 'youtube')),
  access_token text,
  refresh_token text,
  account_email text,
  calendar_id text,
  ics_url text,
  token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_calendar_integrations_family_id
  ON public.calendar_integrations (family_id);

CREATE INDEX IF NOT EXISTS idx_calendar_integrations_provider
  ON public.calendar_integrations (provider);

ALTER TABLE IF EXISTS public.calendar_integrations
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS refresh_token text,
  ADD COLUMN IF NOT EXISTS account_email text,
  ADD COLUMN IF NOT EXISTS calendar_id text,
  ADD COLUMN IF NOT EXISTS ics_url text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Keep updated_at in sync even on pre-existing installs.
CREATE OR REPLACE FUNCTION public.set_calendar_integrations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calendar_integrations_updated_at ON public.calendar_integrations;
CREATE TRIGGER trg_calendar_integrations_updated_at
BEFORE UPDATE ON public.calendar_integrations
FOR EACH ROW
EXECUTE FUNCTION public.set_calendar_integrations_updated_at();

ALTER TABLE IF EXISTS public.calendar_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parents can view family integrations" ON public.calendar_integrations;
CREATE POLICY "Parents can view family integrations"
ON public.calendar_integrations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.family_members fm
    WHERE fm.family_id = calendar_integrations.family_id
      AND fm.user_id = auth.uid()
      AND fm.member_role = 'parent'
  )
);

DROP POLICY IF EXISTS "Parents can manage family integrations" ON public.calendar_integrations;
CREATE POLICY "Parents can manage family integrations"
ON public.calendar_integrations
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.family_members fm
    WHERE fm.family_id = calendar_integrations.family_id
      AND fm.user_id = auth.uid()
      AND fm.member_role = 'parent'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.family_members fm
    WHERE fm.family_id = calendar_integrations.family_id
      AND fm.user_id = auth.uid()
      AND fm.member_role = 'parent'
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_integrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_integrations TO service_role;

-- Compatibility columns for legacy/stale queries against academic_years.
ALTER TABLE IF EXISTS public.academic_years
  ADD COLUMN IF NOT EXISTS subject_targets jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subject_targets_override jsonb DEFAULT NULL;

COMMENT ON COLUMN public.academic_years.subject_targets IS
  'Compatibility field for legacy per-subject targets on academic_years; canonical storage is academic_year_plan.subject_targets.';

COMMENT ON COLUMN public.academic_years.subject_targets_override IS
  'Compatibility field for legacy/stale clients. New planners should use academic_year_plan.subject_targets.';
