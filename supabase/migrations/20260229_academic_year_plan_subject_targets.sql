-- Per-subject goals (optional). When set, overage message can say "X days over the Cats goal".
-- Overall target_days/target_hours remain the backbone; subject_targets are overlays.
ALTER TABLE academic_year_plan
ADD COLUMN IF NOT EXISTS subject_targets jsonb DEFAULT NULL;

COMMENT ON COLUMN academic_year_plan.subject_targets IS 'Optional per-subject goals: { "<subject_id>": { "target_days": 36, "target_hours": 48 } }. When unset, only overall target_days/target_hours apply.';
