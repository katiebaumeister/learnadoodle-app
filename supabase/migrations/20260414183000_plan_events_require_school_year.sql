-- Ensure plan-generated events are always attached to a school year.
-- "School year" is represented by public.academic_years and linked via events.academic_year_id.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS academic_year_id uuid;

CREATE INDEX IF NOT EXISTS idx_events_academic_year_id
  ON public.events (academic_year_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_academic_year_id_fkey'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_academic_year_id_fkey
      FOREIGN KEY (academic_year_id)
      REFERENCES public.academic_years(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_plan_year_requires_academic_year_chk'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_plan_year_requires_academic_year_chk
      CHECK (
        generated_by IS DISTINCT FROM 'plan_year'
        OR academic_year_id IS NOT NULL
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.events
  VALIDATE CONSTRAINT events_plan_year_requires_academic_year_chk;
