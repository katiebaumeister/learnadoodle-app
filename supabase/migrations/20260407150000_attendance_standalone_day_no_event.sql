-- Allow marking attendance on days with no scheduled events (attendance-only use).
-- event_id becomes optional; enforce uniqueness with partial indexes so:
-- - event-linked rows stay one per (event_id, child_id) when event_id is set
-- - at most one manual row per (family_id, child_id, day_date) when event_id is null

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_event_child_unique;

ALTER TABLE public.attendance_records
  ALTER COLUMN event_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_event_child_unique
  ON public.attendance_records (event_id, child_id)
  WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_manual_day_unique
  ON public.attendance_records (family_id, child_id, day_date)
  WHERE event_id IS NULL;

COMMENT ON INDEX public.attendance_records_manual_day_unique IS
  'One manual (no-lesson) attendance row per child per calendar day.';
