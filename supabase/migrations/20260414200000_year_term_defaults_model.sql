-- Year/Term defaults inheritance model (phase 1).
-- Resolution order: school-year defaults -> term overrides -> run overrides.

CREATE TABLE IF NOT EXISTS public.school_year_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_year integer NOT NULL,
  end_year integer NOT NULL,
  label text NOT NULL,
  nominal_start_month_day text NOT NULL DEFAULT '08-15',
  nominal_end_month_day text NOT NULL DEFAULT '06-15',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_year_templates_year_bounds_chk CHECK (end_year = start_year + 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_school_year_templates_start_year_unique
  ON public.school_year_templates (start_year);

CREATE UNIQUE INDEX IF NOT EXISTS idx_school_year_templates_label_unique
  ON public.school_year_templates (label);

CREATE TABLE IF NOT EXISTS public.family_school_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  school_year_template_id uuid REFERENCES public.school_year_templates(id) ON DELETE SET NULL,
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  timezone text NULL,
  year_defaults_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT family_school_years_date_bounds_chk CHECK (end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_family_school_years_family_label_unique
  ON public.family_school_years (family_id, label);

CREATE INDEX IF NOT EXISTS idx_family_school_years_family_id
  ON public.family_school_years (family_id);

CREATE TABLE IF NOT EXISTS public.family_school_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_school_year_id uuid NOT NULL REFERENCES public.family_school_years(id) ON DELETE CASCADE,
  term_index integer NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  term_overrides_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT family_school_terms_date_bounds_chk CHECK (end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_family_school_terms_year_term_index_unique
  ON public.family_school_terms (family_school_year_id, term_index);

CREATE INDEX IF NOT EXISTS idx_family_school_terms_year_id
  ON public.family_school_terms (family_school_year_id);

-- Plan run snapshot fields on existing academic_years rows (backward compatible).
ALTER TABLE IF EXISTS public.academic_years
  ADD COLUMN IF NOT EXISTS family_school_year_id uuid REFERENCES public.family_school_years(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.academic_years
  ADD COLUMN IF NOT EXISTS family_school_term_id uuid REFERENCES public.family_school_terms(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.academic_years
  ADD COLUMN IF NOT EXISTS run_scope_type text NOT NULL DEFAULT 'full_year';

ALTER TABLE IF EXISTS public.academic_years
  ADD COLUMN IF NOT EXISTS use_defaults boolean NOT NULL DEFAULT true;

ALTER TABLE IF EXISTS public.academic_years
  ADD COLUMN IF NOT EXISTS defaults_snapshot_json jsonb NULL;

ALTER TABLE IF EXISTS public.academic_years
  ADD COLUMN IF NOT EXISTS overrides_json jsonb NULL;

ALTER TABLE IF EXISTS public.academic_years
  ADD COLUMN IF NOT EXISTS effective_config_json jsonb NULL;

CREATE INDEX IF NOT EXISTS idx_academic_years_family_school_year_id
  ON public.academic_years (family_school_year_id);

CREATE INDEX IF NOT EXISTS idx_academic_years_family_school_term_id
  ON public.academic_years (family_school_term_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'academic_years'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'academic_years_run_scope_type_chk'
      AND conrelid = 'public.academic_years'::regclass
  ) THEN
    ALTER TABLE public.academic_years
      ADD CONSTRAINT academic_years_run_scope_type_chk
      CHECK (run_scope_type IN ('full_year', 'term')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'academic_years'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'academic_years_term_scope_consistency_chk'
      AND conrelid = 'public.academic_years'::regclass
  ) THEN
    ALTER TABLE public.academic_years
      ADD CONSTRAINT academic_years_term_scope_consistency_chk
      CHECK (
        (run_scope_type = 'full_year' AND family_school_term_id IS NULL)
        OR
        (run_scope_type = 'term' AND family_school_term_id IS NOT NULL)
      ) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'academic_years'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'academic_years_effective_config_required_chk'
      AND conrelid = 'public.academic_years'::regclass
  ) THEN
    ALTER TABLE public.academic_years
      ADD CONSTRAINT academic_years_effective_config_required_chk
      CHECK (
        effective_config_json IS NOT NULL
      ) NOT VALID;
  END IF;
END
$$;

-- Backfill legacy academic_years rows before validating snapshot constraints.
-- Existing rows predate run snapshots, so give them a minimal effective config marker.
UPDATE public.academic_years
SET effective_config_json = COALESCE(
  effective_config_json,
  jsonb_build_object(
    'legacy_row', true,
    'migrated_by', '20260414200000_year_term_defaults_model',
    'migrated_at', to_jsonb(now())
  )
)
WHERE effective_config_json IS NULL;

ALTER TABLE IF EXISTS public.academic_years
  VALIDATE CONSTRAINT academic_years_run_scope_type_chk;

ALTER TABLE IF EXISTS public.academic_years
  VALIDATE CONSTRAINT academic_years_term_scope_consistency_chk;

ALTER TABLE IF EXISTS public.academic_years
  VALIDATE CONSTRAINT academic_years_effective_config_required_chk;

-- Rolling 12-year horizon: seed helper.
CREATE OR REPLACE FUNCTION public.seed_school_year_templates(
  _anchor_year integer DEFAULT EXTRACT(YEAR FROM now())::integer,
  _years_ahead integer DEFAULT 12
) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  _y integer;
  _inserted integer := 0;
BEGIN
  FOR _y IN _anchor_year .. (_anchor_year + GREATEST(_years_ahead, 1) - 1) LOOP
    INSERT INTO public.school_year_templates (
      start_year,
      end_year,
      label
    )
    VALUES (
      _y,
      _y + 1,
      format('%s/%s', _y, right((_y + 1)::text, 2))
    )
    ON CONFLICT (start_year) DO NOTHING;

    IF FOUND THEN
      _inserted := _inserted + 1;
    END IF;
  END LOOP;

  RETURN _inserted;
END;
$$;

SELECT public.seed_school_year_templates();
