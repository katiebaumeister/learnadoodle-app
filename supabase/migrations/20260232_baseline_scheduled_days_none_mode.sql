-- Allow constraint_mode 'none' (no instructional days/hours target) and store baseline for "no requirement" plans.
-- When user applies with no requirement, we store initial placeholder count and dates; if they delete lessons,
-- we show "You deleted a lesson on [date], schedule one to achieve original scheduled total school days."

-- 1. Allow 'none' in constraint_mode (drop and re-add check).
-- PostgreSQL names inline CHECK constraints as tablename_columnname_check.
ALTER TABLE academic_year_plan DROP CONSTRAINT IF EXISTS academic_year_plan_constraint_mode_check;
ALTER TABLE academic_year_plan ADD CONSTRAINT academic_year_plan_constraint_mode_check
  CHECK (constraint_mode IN ('days', 'hours', 'none'));

-- 2. Baseline for no-requirement plans: set on first apply, used to detect deleted lessons
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'academic_year_plan' AND column_name = 'baseline_scheduled_days') THEN
    ALTER TABLE academic_year_plan ADD COLUMN baseline_scheduled_days int NULL;
    COMMENT ON COLUMN academic_year_plan.baseline_scheduled_days IS 'When constraint_mode=none: count of scheduled days at last apply; used to show "schedule one to achieve original total" if user deletes lessons.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'academic_year_plan' AND column_name = 'baseline_scheduled_dates') THEN
    ALTER TABLE academic_year_plan ADD COLUMN baseline_scheduled_dates text[] NULL;
    COMMENT ON COLUMN academic_year_plan.baseline_scheduled_dates IS 'When constraint_mode=none: date strings (YYYY-MM-DD) that had placeholders at last apply; used to compute deleted_dates for UI message.';
  END IF;
END $$;
