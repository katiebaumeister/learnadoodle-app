-- Default planner targets to zero for new rows.
-- UI placeholders can still suggest 180/1000 without persisting those values.

ALTER TABLE public.family_planner_settings
  ALTER COLUMN default_target_days SET DEFAULT 0,
  ALTER COLUMN default_target_hours SET DEFAULT 0;

ALTER TABLE public.family_planner_settings
  ALTER COLUMN attendance_tracking_mode SET DEFAULT 'class_day';

-- Per-subject pacing defaults should also start at zero for newly created subjects.
ALTER TABLE public.subject
  ALTER COLUMN default_target_days SET DEFAULT 0,
  ALTER COLUMN default_target_hours SET DEFAULT 0;
