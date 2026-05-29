-- Speed up get_assignments(child_id) ordering path used by home right rail.
-- Query shape:
--   WHERE child_id = p_child_id
--   ORDER BY due_date ASC NULLS LAST, created_at DESC (with due-date null grouping)
CREATE INDEX IF NOT EXISTS idx_assignments_child_due_created_desc
ON public.assignments (child_id, due_date, created_at DESC);
