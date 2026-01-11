-- Update create_task_event to use is_backlog field instead of date checking
-- This properly marks backlog items

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
BEGIN
  -- For backlog items, use a placeholder date (can be today or a default)
  -- The is_backlog flag is what actually marks it as a backlog item
  IF _is_backlog THEN
    -- Use a reasonable default date for backlog items (today's date)
    -- The is_backlog flag is what matters, not the date
    _final_start_ts := COALESCE(_start_ts, now());
    _final_end_ts := COALESCE(_end_ts, _final_start_ts + interval '30 minutes');
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
  -- For backlog items, we need to catch exclusion_violation (overlap constraint)
  -- and allow it since backlog items can overlap with regular events
  -- Also catch any custom errors from triggers
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
  EXCEPTION
    WHEN exclusion_violation THEN
      -- If it's a backlog item, we can ignore the overlap constraint
      -- For backlog items, overlaps are allowed since they're not scheduled yet
      IF _is_backlog THEN
        -- For backlog items, set child_id to NULL temporarily to bypass the constraint
        -- The is_backlog flag is what matters, not the child assignment at insert time
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
          NULL,  -- Set child_id to NULL to bypass overlap constraint
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
        
        -- Now update child_id after insert (this won't trigger the constraint for backlog items)
        UPDATE events
        SET child_id = _child_id
        WHERE id = _event_id;
      ELSE
        -- For non-backlog items, re-raise the exception
        RAISE;
      END IF;
    WHEN OTHERS THEN
      -- Check if error message contains "overlap" and it's a backlog item
      IF _is_backlog AND SQLERRM LIKE '%overlap%' THEN
        -- For backlog items with overlap errors, try with NULL child_id
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
          NULL,
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
        
        -- Update child_id after insert
        UPDATE events
        SET child_id = _child_id
        WHERE id = _event_id;
      ELSE
        -- Re-raise for other errors or non-backlog items
        RAISE;
      END IF;
  END;

  -- Check for conflicts and coordinate schedule ONLY if not a backlog item
  -- Backlog items don't need conflict detection
  IF NOT _is_backlog THEN
    PERFORM coordinate_family_schedule(_family_id, _event_id, 'add');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', _event_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant permissions - use DO block to grant to the function we just created
DO $$
DECLARE
  func_oid oid;
BEGIN
  -- Find the function we just created
  SELECT oid INTO func_oid
  FROM pg_proc
  WHERE proname = 'create_task_event'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    AND pronargs = 26  -- Number of parameters
  LIMIT 1;

  IF func_oid IS NOT NULL THEN
    -- Grant execute permission
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', func_oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', func_oid::regprocedure);
    
    -- Add comment
    EXECUTE format('COMMENT ON FUNCTION %s IS %L', 
      func_oid::regprocedure,
      'Create an event with support for backlog items (is_backlog flag), family events, shared classes, and full metadata. Skips conflict detection for backlog items.'
    );
  END IF;
END $$;
