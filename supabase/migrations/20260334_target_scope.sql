-- Add target_scope to family_planner_settings
-- overall: use family default for all subjects
-- per_subject: use subject-level targets (subject.default_target_days/hours)
ALTER TABLE family_planner_settings
  ADD COLUMN IF NOT EXISTS target_scope TEXT NOT NULL DEFAULT 'overall'
  CHECK (target_scope IN ('overall', 'per_subject'));

COMMENT ON COLUMN family_planner_settings.target_scope IS 'overall: one target for all subjects | per_subject: use subject-level targets';
