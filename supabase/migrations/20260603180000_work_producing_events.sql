-- Work-producing events: work_spec on events, progress + grade on assignments.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS work_spec jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.events.work_spec IS
  'Work configuration for Assignment, Project, and Exam events (instructions, submission methods, effort, grading).';

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS progress_percent integer,
  ADD COLUMN IF NOT EXISTS grade_display text,
  ADD COLUMN IF NOT EXISTS grade_value numeric;

ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_progress_percent_check;

ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_progress_percent_check
  CHECK (progress_percent IS NULL OR (progress_percent >= 0 AND progress_percent <= 100));

COMMENT ON COLUMN public.assignments.progress_percent IS
  'Project progress 0-100; optional until final submission.';
COMMENT ON COLUMN public.assignments.grade_display IS
  'Human-readable grade: 92%, A, Pass, etc.';
COMMENT ON COLUMN public.assignments.grade_value IS
  'Numeric score when applicable (e.g. exam percent).';
