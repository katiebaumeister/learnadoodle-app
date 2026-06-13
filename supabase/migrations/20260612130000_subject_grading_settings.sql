-- Per-subject grading settings (Google Classroom–style class grading configuration).

ALTER TABLE subject
  ADD COLUMN IF NOT EXISTS grading_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN subject.grading_settings IS
  'Subject grading config: auto_draft_missing, missing_default_grade_percent, calculation_method, show_overall_to_students, categories[]';
