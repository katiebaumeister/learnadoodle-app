-- Speed up recency-ordered child assignment reads used by right-rail quick paths.
CREATE INDEX IF NOT EXISTS idx_assignments_child_updated_at_desc
ON public.assignments (child_id, updated_at DESC);
