-- Add optional default target days/hours to subject (pre-fill subject_targets in Plan My Year)
ALTER TABLE subject
  ADD COLUMN IF NOT EXISTS default_target_days INTEGER NULL,
  ADD COLUMN IF NOT EXISTS default_target_hours NUMERIC(8,2) NULL;

COMMENT ON COLUMN subject.default_target_days IS 'Optional default instructional days per year for this subject; used to pre-fill plan subject_targets when building a plan.';
COMMENT ON COLUMN subject.default_target_hours IS 'Optional default instructional hours per year for this subject; used to pre-fill plan subject_targets when building a plan.';
