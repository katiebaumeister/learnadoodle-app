-- Add school_term to subject (full_year, fall_term, spring_term)
ALTER TABLE public.subject
  ADD COLUMN IF NOT EXISTS school_term TEXT;

-- Default existing and future rows to full_year unless explicitly set.
UPDATE public.subject
SET school_term = 'full_year'
WHERE school_term IS NULL;

ALTER TABLE public.subject
  ALTER COLUMN school_term SET DEFAULT 'full_year';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subject_school_term_allowed_chk'
  ) THEN
    ALTER TABLE public.subject
      ADD CONSTRAINT subject_school_term_allowed_chk
      CHECK (school_term IN ('full_year', 'fall_term', 'spring_term')) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.subject
  VALIDATE CONSTRAINT subject_school_term_allowed_chk;
