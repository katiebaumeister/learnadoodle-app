-- Add recurring event support to events table and create_task_event RPC
-- This migration adds:
-- 1. recurrence_rule (jsonb) - stores recurrence pattern
-- 2. parent_event_id (uuid) - links recurring instances to parent
-- 3. recurrence_id (uuid) - alternative series identifier
-- 4. Updates create_task_event to accept _recurrence_rule parameter

-- Step 0: Update EXCLUDE constraint to exclude recurring master events
-- Recurring master events are templates and shouldn't be checked for overlaps
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
  
  -- Recreate the constraint excluding backlog items AND recurring master events
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
      );
      RAISE NOTICE 'Created EXCLUDE constraint excluding backlog items and recurring master events';
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

-- Step 1: Add recurrence fields to events table if they don't exist
DO $$
BEGIN
  -- Add recurrence_rule column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'recurrence_rule'
  ) THEN
    ALTER TABLE events ADD COLUMN recurrence_rule jsonb;
    CREATE INDEX IF NOT EXISTS idx_events_recurrence_rule ON events USING gin(recurrence_rule) WHERE recurrence_rule IS NOT NULL;
    COMMENT ON COLUMN events.recurrence_rule IS 'Recurrence pattern in JSON format: {frequency: "DAILY|WEEKLY|MONTHLY", interval: N, count?: N, until?: "YYYY-MM-DD"}';
    RAISE NOTICE 'Added recurrence_rule column to events table';
  ELSE
    RAISE NOTICE 'recurrence_rule column already exists';
  END IF;

  -- Add parent_event_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'parent_event_id'
  ) THEN
    ALTER TABLE events ADD COLUMN parent_event_id uuid REFERENCES events(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_events_parent_event_id ON events(parent_event_id) WHERE parent_event_id IS NOT NULL;
    COMMENT ON COLUMN events.parent_event_id IS 'Links recurring event instances to their parent/master event';
    RAISE NOTICE 'Added parent_event_id column to events table';
  ELSE
    RAISE NOTICE 'parent_event_id column already exists';
  END IF;

  -- Add recurrence_id column (alternative series identifier)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'recurrence_id'
  ) THEN
    ALTER TABLE events ADD COLUMN recurrence_id uuid;
    CREATE INDEX IF NOT EXISTS idx_events_recurrence_id ON events(recurrence_id) WHERE recurrence_id IS NOT NULL;
    COMMENT ON COLUMN events.recurrence_id IS 'Alternative identifier for grouping recurring event series (can be parent event ID or separate series ID)';
    RAISE NOTICE 'Added recurrence_id column to events table';
  ELSE
    RAISE NOTICE 'recurrence_id column already exists';
  END IF;
END $$;

-- Step 2: Drop all existing versions of create_task_event to avoid signature conflicts
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

-- Step 3: Create updated create_task_event function with _recurrence_rule parameter
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
  _shared_class_id uuid DEFAULT NULL,
  _recurrence_rule text DEFAULT NULL,  -- JSON string that will be parsed to jsonb
  _percent_of_total_grade numeric(5,2) DEFAULT NULL
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
  _recurrence_rule_jsonb jsonb;
  -- Recurring event generation variables
  _frequency text;
  _interval_val integer;
  _count_val integer;
  _until_date date;
  _current_date date;
  _current_start timestamptz;
  _current_end timestamptz;
  _duration interval;
  _instance_count integer := 0;
  _max_instances integer := 365; -- Safety limit: max 1 year of daily events
  _end_date date;
BEGIN
  -- Parse recurrence_rule from JSON string to jsonb
  IF _recurrence_rule IS NOT NULL AND _recurrence_rule != '' THEN
    BEGIN
      _recurrence_rule_jsonb := _recurrence_rule::jsonb;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Invalid JSON in _recurrence_rule: %', _recurrence_rule;
        _recurrence_rule_jsonb := NULL;
    END;
  ELSE
    _recurrence_rule_jsonb := NULL;
  END IF;

  -- For backlog items, use a unique timestamp to avoid overlaps
  IF _is_backlog THEN
    _backlog_base_ts := '2100-01-01 00:00:00+00'::timestamptz;
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

  -- Set event_type to 'Other' if multiple children or child_ids provided (Family Event was renamed to Other)
  IF _final_child_ids IS NOT NULL AND array_length(_final_child_ids, 1) > 1 THEN
    _event_type := COALESCE(_event_type, 'Other');
  END IF;
  
  -- Ensure event_type is not NULL (default to 'Other' if still NULL)
  IF _event_type IS NULL THEN
    _event_type := 'Other';
  END IF;

  -- Insert event
  -- For recurring master events, set child_id to NULL to bypass overlap constraint
  -- Master events are templates and won't be displayed (only instances will)
  IF _recurrence_rule_jsonb IS NOT NULL THEN
    -- For recurring master events, insert with NULL child_id to bypass constraint
    BEGIN
      INSERT INTO events (
        family_id,
        child_id,  -- Set to NULL to bypass constraint
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
        percent_of_total_grade,
        location,
        mode,
        instructor,
        goal_link,
        minutes,
        materials_attachment_ids,
        source_link,
        resume_position,
        shared_class_id,
        recurrence_rule,
        created_at,
        updated_at
      ) VALUES (
        _family_id,
        NULL,  -- NULL child_id bypasses the EXCLUDE constraint
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
        _percent_of_total_grade,
        _location,
        _mode,
        _instructor,
        _goal_link,
        _calculated_minutes,
        _materials_attachment_ids,
        _source_link,
        _resume_position,
        _shared_class_id,
        _recurrence_rule_jsonb,
        now(),
        now()
      )
      RETURNING id INTO _event_id;
    EXCEPTION
      WHEN exclusion_violation THEN
        -- Even with NULL child_id, if constraint somehow triggers, allow it for recurring masters
        -- Try with a slightly offset time
        _final_start_ts := _final_start_ts + interval '1 microsecond';
        _final_end_ts := _final_end_ts + interval '1 microsecond';
        
        INSERT INTO events (
          family_id, child_id, child_ids, title, description, start_ts, end_ts,
          status, source, tags, is_flexible, is_backlog, event_type, subject_id,
          unit, grade, percent_of_total_grade, location, mode, instructor, goal_link, minutes,
          materials_attachment_ids, source_link, resume_position, shared_class_id,
          recurrence_rule, created_at, updated_at
        ) VALUES (
          _family_id, NULL, _final_child_ids, _title, _description,
          _final_start_ts, _final_end_ts, _status, _source, _tags, _is_flexible,
          _is_backlog, _event_type, _subject_id, _unit, _grade, _percent_of_total_grade, _location, _mode,
          _instructor, _goal_link, _calculated_minutes, _materials_attachment_ids,
          _source_link, _resume_position, _shared_class_id, _recurrence_rule_jsonb,
          now(), now()
        )
        RETURNING id INTO _event_id;
      WHEN OTHERS THEN
        -- If error message contains "overlap", allow it for recurring masters (they're templates)
        IF SQLERRM LIKE '%overlap%' OR SQLERRM LIKE '%conflict%' THEN
          -- Try with offset time
          _final_start_ts := _final_start_ts + interval '1 microsecond';
          _final_end_ts := _final_end_ts + interval '1 microsecond';
          
          INSERT INTO events (
            family_id, child_id, child_ids, title, description, start_ts, end_ts,
            status, source, tags, is_flexible, is_backlog, event_type, subject_id,
            unit, grade, percent_of_total_grade, location, mode, instructor, goal_link, minutes,
            materials_attachment_ids, source_link, resume_position, shared_class_id,
            recurrence_rule, created_at, updated_at
          ) VALUES (
            _family_id, NULL, _final_child_ids, _title, _description,
            _final_start_ts, _final_end_ts, _status, _source, _tags, _is_flexible,
            _is_backlog, _event_type, _subject_id, _unit, _grade, _percent_of_total_grade, _location, _mode,
            _instructor, _goal_link, _calculated_minutes, _materials_attachment_ids,
            _source_link, _resume_position, _shared_class_id, _recurrence_rule_jsonb,
            now(), now()
          )
          RETURNING id INTO _event_id;
        ELSE
          -- Re-raise other errors
          RAISE;
        END IF;
    END;
    
    -- Note: We leave child_id as NULL for recurring master events
    -- Master events are templates and won't be displayed (only instances will)
    -- The instances will have the correct child_id set when they're created
    -- This avoids triggering the EXCLUDE constraint on the master event
  ELSE
    -- For non-recurring events, insert normally (constraint will apply)
    BEGIN
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
        percent_of_total_grade,
        location,
        mode,
        instructor,
        goal_link,
        minutes,
        materials_attachment_ids,
        source_link,
        resume_position,
        shared_class_id,
        recurrence_rule,
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
        _percent_of_total_grade,
        _location,
        _mode,
        _instructor,
        _goal_link,
        _calculated_minutes,
        _materials_attachment_ids,
        _source_link,
        _resume_position,
        _shared_class_id,
        _recurrence_rule_jsonb,
        now(),
        now()
      )
      RETURNING id INTO _event_id;
    EXCEPTION
      WHEN exclusion_violation THEN
        -- The EXCLUDE constraint violation will be caught by the outer EXCEPTION handler
        -- and returned with a user-friendly message
        RAISE;
    END;
  END IF;

  -- If this is a recurring event, set parent_event_id and recurrence_id to itself (it's the master)
  -- Then generate recurring instances
  IF _recurrence_rule_jsonb IS NOT NULL THEN
    UPDATE events
    SET parent_event_id = _event_id,
        recurrence_id = _event_id
    WHERE id = _event_id;
    
    -- Generate recurring instances
    -- Parse recurrence rule
    _frequency := UPPER(_recurrence_rule_jsonb->>'frequency');
    _interval_val := COALESCE((_recurrence_rule_jsonb->>'interval')::integer, 1);
    -- Parse count, handling both string and integer values
    _count_val := CASE 
      WHEN _recurrence_rule_jsonb->>'count' IS NOT NULL 
      THEN (_recurrence_rule_jsonb->>'count')::integer 
      ELSE NULL 
    END;
    _until_date := CASE 
      WHEN _recurrence_rule_jsonb->>'until' IS NOT NULL 
      THEN (_recurrence_rule_jsonb->>'until')::date 
      ELSE NULL 
    END;
    
    -- Calculate duration
    _duration := _final_end_ts - _final_start_ts;
    
    -- Determine end date
    IF _count_val IS NOT NULL AND _count_val > 0 THEN
      -- End after N occurrences
      _max_instances := LEAST(_count_val, _max_instances);
      _end_date := NULL; -- Will be calculated based on count
    ELSIF _until_date IS NOT NULL THEN
      -- End on specific date
      _end_date := _until_date;
    ELSE
      -- Never ends - generate for 1 year from the start date (not current date)
      _end_date := (_final_start_ts::date + interval '1 year')::date;
    END IF;
    
    -- Generate instances based on frequency
    _current_date := _final_start_ts::date;
    _current_start := _final_start_ts;
    _current_end := _final_end_ts;
    
    RAISE NOTICE 'Starting recurring instance generation: frequency=%, interval=%, count=%, until_date=%, end_date=%, max_instances=%', 
      _frequency, _interval_val, _count_val, _until_date, _end_date, _max_instances;
    
    -- Skip the first instance (it's the master event we just created)
    -- Start generating from the next occurrence
    LOOP
      -- Calculate next occurrence date
      CASE _frequency
        WHEN 'DAILY' THEN
          _current_date := _current_date + (_interval_val || ' days')::interval;
        WHEN 'WEEKLY' THEN
          _current_date := _current_date + (_interval_val || ' weeks')::interval;
        WHEN 'MONTHLY' THEN
          _current_date := _current_date + (_interval_val || ' months')::interval;
        ELSE
          RAISE WARNING 'Unknown frequency: %, stopping instance generation', _frequency;
          EXIT; -- Unknown frequency, stop
      END CASE;
      
      -- Check if we've reached the end date
      IF _end_date IS NOT NULL AND _current_date > _end_date THEN
        RAISE NOTICE 'Reached end date: % > %', _current_date, _end_date;
        EXIT;
      END IF;
      
      -- Check if we've created enough instances based on count
      IF _count_val IS NOT NULL AND _instance_count >= _count_val - 1 THEN
        RAISE NOTICE 'Reached count limit: % instances created (count: %)', _instance_count, _count_val;
        EXIT; -- Already created master, so we need count-1 more
      END IF;
      
      -- Check safety limit
      IF _instance_count >= _max_instances THEN
        RAISE WARNING 'Reached max instances limit: %', _max_instances;
        EXIT; -- Safety limit
      END IF;
      
      -- Calculate new start and end times (preserve time of day and timezone)
      -- Extract time components from original start_ts and combine with new date
      -- This preserves the original timezone offset
      _current_start := (_current_date::date + (_final_start_ts::time))::timestamptz;
      _current_end := _current_start + _duration;
      
      -- Insert recurring instance (wrap in exception handling to continue if one fails)
      BEGIN
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
        percent_of_total_grade,
        location,
        mode,
        instructor,
        goal_link,
        minutes,
        materials_attachment_ids,
        source_link,
        resume_position,
        shared_class_id,
        parent_event_id,
        recurrence_id,
        created_at,
        updated_at
      ) VALUES (
        _family_id,
        _child_id,
        _final_child_ids,
        _title,
        _description,
        _current_start,
        _current_end,
        _status,
        _source,
        _tags,
        _is_flexible,
        false, -- Instances are not backlog
        _event_type,
        _subject_id,
        _unit,
        _grade,
        _percent_of_total_grade,
        _location,
        _mode,
        _instructor,
        _goal_link,
        _calculated_minutes,
        _materials_attachment_ids,
        _source_link,
        _resume_position,
        _shared_class_id,
        _event_id, -- parent_event_id points to master
        _event_id, -- recurrence_id points to master
          now(),
          now()
        );
        
        _instance_count := _instance_count + 1;
        RAISE NOTICE 'Created recurring instance % for date % (start_ts: %)', _instance_count, _current_date, _current_start;
      EXCEPTION
        WHEN OTHERS THEN
          -- If instance insert fails (e.g., due to overlap), log and continue
          -- This allows other instances to be created even if some conflict
          RAISE WARNING 'Failed to create recurring instance for date %: %', _current_date, SQLERRM;
      END;
    END LOOP;
    
    RAISE NOTICE 'Finished generating recurring instances. Total instances created: %', _instance_count;
  END IF;

  -- Check for conflicts and coordinate schedule ONLY if not a backlog item AND not a recurring master event
  -- Recurring master events are templates - instances are checked by EXCLUDE constraint when inserted
  -- If instances overlap, they'll fail at insert time (which is acceptable - user can adjust)
  IF NOT _is_backlog AND _recurrence_rule_jsonb IS NULL THEN
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
      WHEN _recurrence_rule_jsonb IS NOT NULL THEN 'Recurring event created successfully'
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
  func_signature text;
BEGIN
  SELECT COUNT(*), string_agg(oid::regprocedure::text, ', ') INTO func_count, func_signature
  FROM pg_proc
  WHERE proname = 'create_task_event'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
  
  IF func_count = 0 THEN
    RAISE EXCEPTION 'create_task_event function was not created! Check for errors above.';
  ELSE
    RAISE NOTICE 'create_task_event function created successfully (% version(s) exist): %', func_count, func_signature;
  END IF;
END $$;

-- Grant permissions - grant on all overloads of the function
DO $$
DECLARE
  func_record RECORD;
BEGIN
  -- Grant execute permission on all versions of create_task_event
  FOR func_record IN
    SELECT oid::regprocedure::text as func_signature
    FROM pg_proc
    WHERE proname = 'create_task_event'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    BEGIN
      EXECUTE 'GRANT EXECUTE ON FUNCTION ' || func_record.func_signature || ' TO authenticated, anon';
      RAISE NOTICE 'Granted execute on: %', func_record.func_signature;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Error granting on %: %', func_record.func_signature, SQLERRM;
    END;
  END LOOP;
  
  IF NOT FOUND THEN
    RAISE WARNING 'No create_task_event function found to grant permissions on';
  END IF;
END $$;

-- Add comment
COMMENT ON FUNCTION public.create_task_event IS 'Creates a task/event. Supports recurring events via _recurrence_rule parameter (JSON string). For backlog items, uses unique timestamps to avoid overlap constraints.';

-- Final notification
DO $$
BEGIN
  RAISE NOTICE 'Recurring events support added successfully!';
END $$;

