-- Exclude plan-year placeholders from the no-overlap constraint
-- So "Apply to calendar" can insert placeholders even when they overlap existing events.
-- Users can resolve conflicts in the UI (move/delete placeholders).
-- ============================================================

DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'events'::regclass
      AND contype = 'x'
  LOOP
    RAISE NOTICE 'Dropping EXCLUDE constraint: %', constraint_record.conname;
    EXECUTE format('ALTER TABLE events DROP CONSTRAINT IF EXISTS %I CASCADE', constraint_record.conname);
  END LOOP;
END $$;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Recreate with same exclusions plus plan_year placeholders (inline conflict resolution)
ALTER TABLE events
  ADD CONSTRAINT events_no_overlap_exclude
  EXCLUDE USING gist (
    child_id WITH =,
    tstzrange(start_ts, end_ts) WITH &&
  ) WHERE (
    COALESCE(is_backlog, false) = false
    AND COALESCE(is_flexible, false) = false
    AND recurrence_rule IS NULL
    AND COALESCE(status, '') != 'canceled'
    AND canceled_at IS NULL
    AND deleted_at IS NULL
    AND NOT (is_placeholder = true AND generated_by = 'plan_year')
  );

COMMENT ON CONSTRAINT events_no_overlap_exclude ON events IS
  'Prevents overlapping events for the same child, excluding backlog, flexible, recurring masters, canceled, deleted, and plan_year placeholders';
