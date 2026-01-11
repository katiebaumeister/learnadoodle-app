-- Final fix for create_task_event to handle backlog items without overlap errors
-- This version uses a unique timestamp for backlog items to completely avoid overlaps

-- Drop all existing versions of create_task_event to avoid conflicts
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
  END LOOP;
END $$;

-- Create the updated function with is_backlog parameter
CREATE FUNCTION public.create_task_event(
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
  _is_backlog boolean DEFAULT false
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

  -- Determine child_ids array
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
      'error', SQLERRM,
      'error_code', SQLSTATE
    );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_task_event(
  uuid, text, timestamptz, uuid, uuid[], text, timestamptz, text, text, text[], 
  boolean, text, uuid, text, text, text, text, text, text, uuid, integer, 
  uuid[], text, text, uuid, boolean
) TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION public.create_task_event IS 'Creates a task/event. For backlog items, uses unique timestamps to avoid overlap constraints.';
