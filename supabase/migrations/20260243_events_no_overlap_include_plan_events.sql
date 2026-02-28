-- Plan My Year creates real Lesson events (not placeholders). They are subject to the overlap constraint.
-- Remove the exemption for plan_year so plan events cannot double-book the same child.
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
    IF current_def IS NOT NULL AND current_def LIKE '%plan_year%' THEN
      needs_recreate := true;
      RAISE NOTICE 'EXCLUDE constraint still exempts plan_year; dropping and recreating: %', constraint_record.conname;
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
        AND deleted_at IS NULL
      );
    RAISE NOTICE 'Created events_no_overlap_exclude; plan events are now subject to overlap constraint';
  END IF;
END $$;

COMMENT ON CONSTRAINT events_no_overlap_exclude ON events IS
  'Prevents overlapping events for the same child. Excludes backlog, flexible, recurring masters, canceled, and soft-deleted (trash). Plan My Year events are real events and are included.';
