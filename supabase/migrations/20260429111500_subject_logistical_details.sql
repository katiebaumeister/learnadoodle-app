-- Add logistical detail fields to subjects.
ALTER TABLE public.subject
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS mode TEXT,
  ADD COLUMN IF NOT EXISTS instructor TEXT,
  ADD COLUMN IF NOT EXISTS connected_calendar_targets TEXT[];

-- Ensure every row has a normalized empty list by default.
UPDATE public.subject
SET connected_calendar_targets = '{}'
WHERE connected_calendar_targets IS NULL;

ALTER TABLE public.subject
  ALTER COLUMN connected_calendar_targets SET DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subject_mode_allowed_chk'
  ) THEN
    ALTER TABLE public.subject
      ADD CONSTRAINT subject_mode_allowed_chk
      CHECK (mode IS NULL OR mode IN ('home', 'online', 'outside', 'travel')) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.subject
  VALIDATE CONSTRAINT subject_mode_allowed_chk;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subject_connected_calendar_targets_allowed_chk'
  ) THEN
    ALTER TABLE public.subject
      ADD CONSTRAINT subject_connected_calendar_targets_allowed_chk
      CHECK (
        connected_calendar_targets IS NULL
        OR connected_calendar_targets <@ ARRAY['google', 'apple']::TEXT[]
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.subject
  VALIDATE CONSTRAINT subject_connected_calendar_targets_allowed_chk;
