-- Fix EXCLUDE constraint to exclude soft-deleted events
-- Soft-deleted events (deleted_at IS NOT NULL) should not prevent new events from being created

DO $$
DECLARE
  constraint_record RECORD;
  constraint_dropped boolean := false;
  current_constraint_def text;
BEGIN
  -- First, check if constraint already has deleted_at exclusion
  FOR constraint_record IN
    SELECT conname, pg_get_constraintdef(oid) as constraint_def
    FROM pg_constraint
    WHERE conrelid = 'events'::regclass
      AND contype = 'x'  -- 'x' = EXCLUDE constraint
  LOOP
    current_constraint_def := constraint_record.constraint_def;
    RAISE NOTICE 'Found EXCLUDE constraint: %', constraint_record.conname;
    RAISE NOTICE 'Current definition: %', current_constraint_def;
    
    -- Check if deleted_at is already in the WHERE clause
    IF current_constraint_def LIKE '%deleted_at IS NULL%' THEN
      RAISE NOTICE 'Constraint already excludes deleted_at, no update needed';
      RETURN;
    END IF;
    
    -- Drop the constraint to recreate it
    RAISE NOTICE 'Dropping EXCLUDE constraint: %', constraint_record.conname;
    EXECUTE format('ALTER TABLE events DROP CONSTRAINT IF EXISTS %I CASCADE', constraint_record.conname);
    constraint_dropped := true;
  END LOOP;
  
  -- Create btree_gist extension if needed
  CREATE EXTENSION IF NOT EXISTS btree_gist;
  
  -- Recreate the constraint excluding backlog items, recurring master events, canceled events, AND soft-deleted events
  IF constraint_dropped THEN
    BEGIN
      ALTER TABLE events 
      ADD CONSTRAINT events_no_overlap_exclude 
      EXCLUDE USING gist (
        child_id WITH =,
        tsrange(start_ts, end_ts) WITH &&
      ) WHERE (
        (is_backlog IS NULL OR is_backlog = false)
        AND recurrence_rule IS NULL  -- Exclude recurring master events (they're templates)
        AND (status IS NULL OR status != 'canceled')
        AND canceled_at IS NULL
        AND deleted_at IS NULL  -- Exclude soft-deleted events
      );
      RAISE NOTICE 'Created EXCLUDE constraint excluding backlog items, recurring master events, canceled events, and soft-deleted events';
    EXCEPTION
      WHEN duplicate_object THEN
        RAISE NOTICE 'Constraint events_no_overlap_exclude already exists';
      WHEN OTHERS THEN
        RAISE NOTICE 'Error creating constraint: %', SQLERRM;
        RAISE;
    END;
  ELSE
    -- No constraint found, create it
    BEGIN
      ALTER TABLE events 
      ADD CONSTRAINT events_no_overlap_exclude 
      EXCLUDE USING gist (
        child_id WITH =,
        tsrange(start_ts, end_ts) WITH &&
      ) WHERE (
        (is_backlog IS NULL OR is_backlog = false)
        AND recurrence_rule IS NULL
        AND (status IS NULL OR status != 'canceled')
        AND canceled_at IS NULL
        AND deleted_at IS NULL
      );
      RAISE NOTICE 'Created new EXCLUDE constraint excluding backlog items, recurring master events, canceled events, and soft-deleted events';
    EXCEPTION
      WHEN duplicate_object THEN
        RAISE NOTICE 'Constraint events_no_overlap_exclude already exists';
      WHEN OTHERS THEN
        RAISE NOTICE 'Error creating constraint: %', SQLERRM;
    END;
  END IF;
END $$;

