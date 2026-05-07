-- Attendance mode source of truth: academic_years.attendance_tracking_mode
-- New default: class_day
-- Preserve existing subject-based generated plan years as subject mode.

ALTER TABLE public.academic_years
ADD COLUMN IF NOT EXISTS attendance_tracking_mode text;

ALTER TABLE public.academic_years
DROP CONSTRAINT IF EXISTS academic_years_attendance_tracking_mode_check;

ALTER TABLE public.academic_years
ADD CONSTRAINT academic_years_attendance_tracking_mode_check
CHECK (attendance_tracking_mode IN ('class_day', 'subject'));

UPDATE public.academic_years ay
SET attendance_tracking_mode = 'subject'
WHERE attendance_tracking_mode IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.academic_year_id = ay.id
      AND e.generated_by = 'plan_year'
      AND e.event_type = 'Lesson'
      AND e.subject_id IS NOT NULL
      AND e.deleted_at IS NULL
  );

UPDATE public.academic_years
SET attendance_tracking_mode = 'class_day'
WHERE attendance_tracking_mode IS NULL;

ALTER TABLE public.academic_years
ALTER COLUMN attendance_tracking_mode SET DEFAULT 'class_day';

ALTER TABLE public.academic_years
ALTER COLUMN attendance_tracking_mode SET NOT NULL;

-- Optional compatibility column for legacy settings payloads; not source of truth.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'family_planner_settings'
      AND column_name = 'attendance_tracking_mode'
  ) THEN
    ALTER TABLE public.family_planner_settings
      ADD COLUMN attendance_tracking_mode text;
  END IF;
END $$;

ALTER TABLE public.family_planner_settings
  DROP CONSTRAINT IF EXISTS family_planner_settings_attendance_tracking_mode_check;

ALTER TABLE public.family_planner_settings
  ADD CONSTRAINT family_planner_settings_attendance_tracking_mode_check
  CHECK (attendance_tracking_mode IS NULL OR attendance_tracking_mode IN ('subject', 'class_day'));

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_event_type_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_event_type_check
  CHECK (
    event_type IS NULL
    OR event_type IN (
      'Appointment',
      'Travel',
      'Live Class',
      'Home Lesson',
      'Core Class',
      'Activity',
      'Sport',
      'Assessment',
      'Meeting',
      'Family Event',
      'Lesson',
      'Project',
      'Exam',
      'Assignment',
      'Holiday',
      'Trip',
      'Other',
      'Schedule Block',
      'ClassDay'
    )
  );

ALTER TABLE public.events
  ALTER COLUMN subject_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_events_plan_classday_slot
ON public.events (family_id, academic_year_id, start_ts, end_ts)
WHERE generated_by = 'plan_year'
  AND event_type = 'ClassDay'
  AND counts_toward_plan = TRUE
  AND deleted_at IS NULL;
