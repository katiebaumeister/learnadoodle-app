-- Planning mode: HOMESCHOOL_COMPLIANCE | AFTERSCHOOL_GOALS | NONE
-- Drives Plan Year modal and Add Event "count as instructional" visibility.
ALTER TABLE academic_year_plan
ADD COLUMN IF NOT EXISTS planning_mode text NOT NULL DEFAULT 'HOMESCHOOL_COMPLIANCE';

ALTER TABLE academic_year_plan
ADD CONSTRAINT academic_year_plan_planning_mode_check
CHECK (planning_mode IN ('HOMESCHOOL_COMPLIANCE', 'AFTERSCHOOL_GOALS', 'NONE'));

COMMENT ON COLUMN academic_year_plan.planning_mode IS 'HOMESCHOOL_COMPLIANCE: targets required, Add Event shows count toggle. AFTERSCHOOL_GOALS: targets optional. NONE: hide constraint UI.';
