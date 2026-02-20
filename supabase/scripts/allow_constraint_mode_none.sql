-- Run this in Supabase SQL Editor if apply_to_calendar fails with:
--   "violates check constraint academic_year_plan_constraint_mode_check"
-- when using a "No requirement" (None) plan. Then re-apply your plan from the Edit Plan modal.

ALTER TABLE academic_year_plan DROP CONSTRAINT IF EXISTS academic_year_plan_constraint_mode_check;
ALTER TABLE academic_year_plan ADD CONSTRAINT academic_year_plan_constraint_mode_check
  CHECK (constraint_mode IN ('days', 'hours', 'none'));

ALTER TABLE academic_year_plan ADD COLUMN IF NOT EXISTS baseline_scheduled_days int NULL;
ALTER TABLE academic_year_plan ADD COLUMN IF NOT EXISTS baseline_scheduled_dates text[] NULL;
