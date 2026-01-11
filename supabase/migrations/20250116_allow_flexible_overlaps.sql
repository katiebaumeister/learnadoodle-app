-- =====================================================
-- Allow Flexible Events to Overlap
-- Modify exclusion constraint to exclude flexible items
-- This allows users to intentionally create overlapping events
-- =====================================================

-- Step 1: Drop ALL existing exclusion constraints (in case the name is different)
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

-- Step 2: Recreate the constraint excluding backlog items AND flexible items
-- Flexible items can intentionally overlap (e.g., power users stacking events)
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  BEGIN
    ALTER TABLE events 
    ADD CONSTRAINT events_no_overlap_exclude 
    EXCLUDE USING gist (
      child_id WITH =,
      tstzrange(start_ts, end_ts) WITH &&
    ) WHERE (
      COALESCE(is_backlog, false) = false  -- Exclude backlog items (NULL treated as false)
      AND COALESCE(is_flexible, false) = false  -- Exclude flexible items (NULL treated as false)
      AND recurrence_rule IS NULL
      AND COALESCE(status, '') != 'canceled'
      AND canceled_at IS NULL
      AND deleted_at IS NULL
    );
    RAISE NOTICE 'Created EXCLUDE constraint excluding backlog items and flexible items';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'Constraint events_no_overlap_exclude already exists';
    WHEN OTHERS THEN
      RAISE NOTICE 'Error creating constraint: %', SQLERRM;
      RAISE;
  END;
END $$;

COMMENT ON CONSTRAINT events_no_overlap_exclude ON events IS 
  'Prevents overlapping events for the same child, excluding backlog items, flexible items, recurring masters, canceled events, and deleted events';

-- Verify the constraint was created correctly
DO $$
DECLARE
  constraint_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO constraint_def
  FROM pg_constraint
  WHERE conrelid = 'events'::regclass
    AND contype = 'x'
    AND conname = 'events_no_overlap_exclude';
  
  IF constraint_def IS NULL THEN
    RAISE EXCEPTION 'Constraint events_no_overlap_exclude was not created';
  END IF;
  
  IF constraint_def NOT LIKE '%is_flexible%' THEN
    RAISE EXCEPTION 'Constraint definition does not include is_flexible check: %', constraint_def;
  END IF;
  
  -- Verify the constraint uses COALESCE or equivalent logic
  IF constraint_def NOT LIKE '%COALESCE(is_flexible%' AND constraint_def NOT LIKE '%(is_flexible IS NULL%' THEN
    RAISE EXCEPTION 'Constraint definition does not appear to exclude flexible items correctly: %', constraint_def;
  END IF;
  
  RAISE NOTICE 'Constraint created successfully: %', constraint_def;
END $$;

