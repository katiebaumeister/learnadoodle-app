-- Ensure soft-deleted events (in Trash) do NOT block new event inserts
-- If deleted_at IS NOT NULL, the row must be excluded from the overlap constraint
-- so "Apply to calendar" and other inserts succeed when the only conflict is a trashed event.
-- ============================================================

DO $$
DECLARE
  constraint_record RECORD;
  current_def text;
  needs_recreate boolean := false;
BEGIN
  FOR constraint_record IN
    SELECT conname, pg_get_constraintdef(oid) AS constraint_def
    FROM pg_constraint
    WHERE conrelid = 'events'::regclass
      AND contype = 'x'
  LOOP
    current_def := constraint_record.constraint_def;
    -- If constraint does not exclude soft-deleted rows, recreate it
    IF current_def IS NULL OR current_def NOT LIKE '%deleted_at IS NULL%' THEN
      needs_recreate := true;
      RAISE NOTICE 'EXCLUDE constraint missing deleted_at IS NULL; dropping and recreating: %', constraint_record.conname;
      EXECUTE format('ALTER TABLE events DROP CONSTRAINT IF EXISTS %I CASCADE', constraint_record.conname);
    END IF;
  END LOOP;

  IF needs_recreate THEN
    CREATE EXTENSION IF NOT EXISTS btree_gist;
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
        AND deleted_at IS NULL  -- soft-deleted (trash) events must not block new inserts
        AND NOT (is_placeholder = true AND generated_by = 'plan_year')
      );
    RAISE NOTICE 'Created events_no_overlap_exclude excluding soft-deleted events';
  END IF;
END $$;

COMMENT ON CONSTRAINT events_no_overlap_exclude ON events IS
  'Prevents overlapping events for the same child. Excludes backlog, flexible, recurring masters, canceled, soft-deleted (trash), and plan_year placeholders.';
