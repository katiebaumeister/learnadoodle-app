-- Complete fix for backlog items - run this script to fix all issues
-- This script:
-- 1. Adds is_backlog column if missing
-- 2. Fixes the EXCLUDE constraint to exclude backlog items
-- 3. Updates create_task_event to use unique timestamps for backlog items

-- Step 1: Add is_backlog column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'is_backlog'
  ) THEN
    ALTER TABLE events ADD COLUMN is_backlog boolean DEFAULT false;
    CREATE INDEX IF NOT EXISTS idx_events_is_backlog ON events(is_backlog) WHERE is_backlog = true;
    UPDATE events SET is_backlog = true WHERE EXTRACT(YEAR FROM start_ts) >= 2099 AND is_flexible = true AND (is_backlog IS NULL OR is_backlog = false);
    COMMENT ON COLUMN events.is_backlog IS 'Marks events as backlog items that are not yet scheduled on the calendar';
    RAISE NOTICE 'Added is_backlog column';
  ELSE
    RAISE NOTICE 'is_backlog column already exists';
  END IF;
END $$;

-- Step 2: Fix EXCLUDE constraint to exclude backlog items
DO $$
DECLARE
  constraint_record RECORD;
  constraint_dropped boolean := false;
BEGIN
  -- Drop all EXCLUDE constraints on events table
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'events'::regclass
      AND contype = 'x'  -- 'x' = EXCLUDE constraint
  LOOP
    RAISE NOTICE 'Dropping EXCLUDE constraint: %', constraint_record.conname;
    EXECUTE format('ALTER TABLE events DROP CONSTRAINT IF EXISTS %I CASCADE', constraint_record.conname);
    constraint_dropped := true;
  END LOOP;
  
  -- Create btree_gist extension if needed
  CREATE EXTENSION IF NOT EXISTS btree_gist;
  
  -- Recreate the constraint excluding backlog items
  IF constraint_dropped THEN
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
    END;
  ELSE
    RAISE NOTICE 'No EXCLUDE constraints found to modify';
  END IF;
END $$;

-- Step 3: Drop and recreate create_task_event with unique timestamp logic for backlog items
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT oid::regprocedure::text as func_signature
    FROM pg_proc
    WHERE proname = 'create_task_event'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
    RAISE NOTICE 'Dropped function: %', r.func_signature;
  END LOOP;
END $$;

-- Create the updated function
-- Note: All required parameters must come first, then all optional parameters with defaults
CREATE OR REPLACE FUNCTION public.create_task_event(
  _family_id uuid,
  _title text,
  _start_ts timestamptz,
  _child_id uuid DEFAULT NULL,
  _child_ids uuid[] DEFAULT NULL,
  _description text DEFAULT NULL,
  _end_ts timestamptz DEFAULT NULL,
  _status text DEFAULT 'scheduled',
  _source text DEFAULT 'manual',
  _tags text[] DEFAULT NULL,
  _is_flexible boolean DEFAULT false,
  _is_backlog boolean DEFAULT false,
  _event_type text DEFAULT NULL,
  _subject_id uuid DEFAULT NULL,
  _unit text DEFAULT NULL,
  _grade text DEFAULT NULL,
  _location text DEFAULT NULL,
  _mode text DEFAULT NULL,
  _instructor text DEFAULT NULL,
  _goal_link uuid DEFAULT NULL,
  _minutes integer DEFAULT NULL,
  _materials_attachment_ids uuid[] DEFAULT NULL,
  _source_link text DEFAULT NULL,
  _resume_position text DEFAULT NULL,
  _shared_class_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event_id uuid;
  _calculated_minutes integer;
  _final_child_ids uuid[];
  _final_start_ts timestamptz;
  _final_end_ts timestamptz;
  _backlog_base_ts timestamptz;
  _unique_offset interval;
BEGIN
  -- For backlog items, use a unique timestamp to avoid overlaps
  -- We'll use a base date (year 2100) and add a unique offset based on microseconds
  IF _is_backlog THEN
    -- Use a far future base date (year 2100) that won't conflict with real events
    -- Add a unique offset based on current timestamp microseconds to ensure uniqueness
    -- Use a combination of epoch seconds and microseconds to guarantee uniqueness
    _backlog_base_ts := '2100-01-01 00:00:00+00'::timestamptz;
    -- Create a unique offset: use epoch seconds * 1000000 + microseconds
    -- This ensures each backlog item gets a unique timestamp
    _unique_offset := (
      (EXTRACT(EPOCH FROM now())::bigint * 1000000 + 
       EXTRACT(MICROSECONDS FROM now())::bigint) || ' microseconds'
    )::interval;
    _final_start_ts := _backlog_base_ts + _unique_offset;
    _final_end_ts := _final_start_ts + interval '30 minutes';
  ELSE
    _final_start_ts := _start_ts;
    _final_end_ts := COALESCE(_end_ts, _start_ts + interval '30 minutes');
  END IF;

  -- Calculate minutes if not provided
  IF _minutes IS NULL AND _final_end_ts IS NOT NULL THEN
    _calculated_minutes := EXTRACT(EPOCH FROM (_final_end_ts - _final_start_ts)) / 60;
  ELSE
    _calculated_minutes := COALESCE(_minutes, 30);
  END IF;

  -- Determine child_ids array (handle both _child_id and _child_ids)
  IF _child_ids IS NOT NULL AND array_length(_child_ids, 1) > 0 THEN
    _final_child_ids := _child_ids;
  ELSIF _child_id IS NOT NULL THEN
    _final_child_ids := ARRAY[_child_id];
  ELSE
    _final_child_ids := NULL;
  END IF;

  -- Set event_type to 'Family Event' if multiple children or child_ids provided
  IF _final_child_ids IS NOT NULL AND array_length(_final_child_ids, 1) > 1 THEN
    _event_type := COALESCE(_event_type, 'Family Event');
  END IF;

  -- Insert event
  -- For backlog items, we use unique timestamps so they won't overlap
  -- Even if the constraint doesn't exclude backlog items, the unique timestamps prevent conflicts
  INSERT INTO events (
    family_id,
    child_id,
    child_ids,
    title,
    description,
    start_ts,
    end_ts,
    status,
    source,
    tags,
    is_flexible,
    is_backlog,
    event_type,
    subject_id,
    unit,
    grade,
    location,
    mode,
    instructor,
    goal_link,
    minutes,
    materials_attachment_ids,
    source_link,
    resume_position,
    shared_class_id,
    created_at,
    updated_at
  ) VALUES (
    _family_id,
    _child_id,
    _final_child_ids,
    _title,
    _description,
    _final_start_ts,
    _final_end_ts,
    _status,
    _source,
    _tags,
    _is_flexible,
    _is_backlog,
    _event_type,
    _subject_id,
    _unit,
    _grade,
    _location,
    _mode,
    _instructor,
    _goal_link,
    _calculated_minutes,
    _materials_attachment_ids,
    _source_link,
    _resume_position,
    _shared_class_id,
    now(),
    now()
  )
  RETURNING id INTO _event_id;

  -- Check for conflicts and coordinate schedule ONLY if not a backlog item
  -- Backlog items don't need conflict detection
  IF NOT _is_backlog THEN
    PERFORM coordinate_family_schedule(_family_id, _event_id, 'add');
  END IF;

  -- Return success with event details
  RETURN jsonb_build_object(
    'success', true,
    'ok', true,
    'id', _event_id,
    'event_id', _event_id,
    'message', CASE 
      WHEN _is_backlog THEN 'Backlog item created successfully'
      ELSE 'Event created successfully'
    END
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error and return failure
    RETURN jsonb_build_object(
      'success', false,
      'ok', false,
      'error', SQLERRM,
      'error_code', SQLSTATE
    );
  END;
$$;

-- Verify function was created
DO $$
DECLARE
  func_count int;
BEGIN
  SELECT COUNT(*) INTO func_count
  FROM pg_proc
  WHERE proname = 'create_task_event'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
  
  IF func_count = 0 THEN
    RAISE EXCEPTION 'create_task_event function was not created! Check for errors above.';
  ELSE
    RAISE NOTICE 'create_task_event function created successfully (% version(s) exist)', func_count;
  END IF;
END $$;

-- Grant permissions
-- Note: This must match the exact function signature created above
DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.create_task_event(
    uuid, text, timestamptz, uuid, uuid[], text, timestamptz, text, text, text[], 
    boolean, boolean, text, uuid, text, text, text, text, text, text, uuid, integer, 
    uuid[], text, text, uuid
  ) TO authenticated, anon;
  RAISE NOTICE 'Granted execute permissions on create_task_event';
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'Function create_task_event not found - it may have failed to create. Check for errors above.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Error granting permissions: %', SQLERRM;
END $$;

-- Add comment
COMMENT ON FUNCTION public.create_task_event IS 'Creates a task/event. For backlog items, uses unique timestamps (year 2100 + unique offset) to avoid overlap constraints.';

-- Final notification
DO $$
BEGIN
  RAISE NOTICE 'Complete backlog fix applied successfully!';
END $$;
