-- Fix create_task_event to skip conflict detection for backlog items (dates >= 2099)
-- Backlog items shouldn't trigger conflict detection since they're far in the future

CREATE OR REPLACE FUNCTION public.create_task_event(
  _family_id uuid,
  _title text,
  _start_ts timestamptz,
  _child_id uuid DEFAULT NULL,
  _child_ids uuid[] DEFAULT NULL,
  _description text DEFAULT NULL,
  _end_ts timestamptz DEFAULT NULL,
  _status text DEFAULT 'scheduled',
  _source text DEFAULT 'task_create',
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
  _is_backlog_item boolean;
BEGIN
  -- Check if this is a backlog item (date >= 2099)
  _is_backlog_item := EXTRACT(YEAR FROM _start_ts) >= 2099;

  -- Calculate minutes if not provided
  IF _minutes IS NULL AND _end_ts IS NOT NULL THEN
    _calculated_minutes := EXTRACT(EPOCH FROM (_end_ts - _start_ts)) / 60;
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
    _start_ts,
    COALESCE(_end_ts, _start_ts + (_calculated_minutes || ' minutes')::interval),
    _status,
    _source,
    _tags,
    _is_flexible,
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
  -- Backlog items (dates >= 2099) don't need conflict detection
  IF NOT _is_backlog_item THEN
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

GRANT EXECUTE ON FUNCTION public.create_task_event TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_task_event TO service_role;

COMMENT ON FUNCTION public.create_task_event IS 'Create an event with support for family events (multiple children), shared classes, and full metadata. Skips conflict detection for backlog items (dates >= 2099)';
