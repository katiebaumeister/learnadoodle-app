-- Allow counting events as instructional time without attaching to a plan.
-- Events with counts_toward_plan = true and academic_year_id IS NULL will count
-- for attendance / general instructional time but not for any specific plan's health.

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_instructional_requires_academic_year;

COMMENT ON COLUMN events.academic_year_id IS 'Optional: when set, event counts toward this plan''s compliance. When null but counts_toward_plan=true, event counts as instructional time (e.g. attendance) but not toward a specific plan.';
