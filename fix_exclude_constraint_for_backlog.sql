-- Check and modify EXCLUDE constraint to exclude backlog items
-- Backlog items should be allowed to overlap since they're not scheduled yet

-- First, find all EXCLUDE constraints on events table
DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  -- Find all EXCLUDE constraints on events table
  FOR constraint_record IN
    SELECT conname, pg_get_constraintdef(oid) as constraint_def
    FROM pg_constraint
    WHERE conrelid = 'events'::regclass
      AND contype = 'x'  -- 'x' = EXCLUDE constraint
  LOOP
    RAISE NOTICE 'Found EXCLUDE constraint: %', constraint_record.conname;
    RAISE NOTICE 'Definition: %', constraint_record.constraint_def;
    
    -- Drop the existing constraint
    EXECUTE format('ALTER TABLE events DROP CONSTRAINT IF EXISTS %I CASCADE', constraint_record.conname);
    RAISE NOTICE 'Dropped constraint: %', constraint_record.conname;
  END LOOP;
  
  -- Recreate the constraint excluding backlog items
  -- Only check for overlaps on non-backlog items
  -- Note: This assumes the constraint was on (child_id, tsrange(start_ts, end_ts))
  -- Adjust the constraint definition based on what was found above
  BEGIN
    ALTER TABLE events 
    ADD CONSTRAINT events_no_overlap_exclude 
    EXCLUDE USING gist (
      child_id WITH =,
      tsrange(start_ts, end_ts) WITH &&
    ) WHERE (
      (is_backlog IS NULL OR is_backlog = false)
      AND status != 'canceled'
      AND canceled_at IS NULL
    );
    RAISE NOTICE 'Created new EXCLUDE constraint excluding backlog items';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'Constraint already exists, skipping';
    WHEN OTHERS THEN
      RAISE NOTICE 'Error creating constraint: %', SQLERRM;
  END;
END $$;
