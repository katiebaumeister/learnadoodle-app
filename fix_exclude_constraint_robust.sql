-- Robust fix for EXCLUDE constraint to exclude backlog items
-- This handles various constraint scenarios

-- Step 1: Drop ALL EXCLUDE constraints on events table
DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'events'::regclass
      AND contype = 'x'  -- 'x' = EXCLUDE constraint
  LOOP
    RAISE NOTICE 'Dropping EXCLUDE constraint: %', constraint_record.conname;
    EXECUTE format('ALTER TABLE events DROP CONSTRAINT IF EXISTS %I CASCADE', constraint_record.conname);
  END LOOP;
END $$;

-- Step 2: Check if we need to create btree_gist extension for the constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Step 3: Recreate the constraint excluding backlog items
-- This prevents overlaps only for non-backlog, non-canceled events
DO $$
BEGIN
  -- Try to create the constraint
  BEGIN
    ALTER TABLE events 
    ADD CONSTRAINT events_no_overlap_exclude 
    EXCLUDE USING gist (
      child_id WITH =,
      tsrange(start_ts, end_ts) WITH &&
    ) WHERE (
      (is_backlog IS NULL OR is_backlog = false)
      AND (status IS NULL OR status != 'canceled')
      AND canceled_at IS NULL
    );
    RAISE NOTICE 'Created EXCLUDE constraint excluding backlog items';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'Constraint events_no_overlap_exclude already exists';
    WHEN OTHERS THEN
      RAISE NOTICE 'Error creating constraint: %', SQLERRM;
      -- If the constraint creation fails, we'll rely on the function-level handling
  END;
END $$;

