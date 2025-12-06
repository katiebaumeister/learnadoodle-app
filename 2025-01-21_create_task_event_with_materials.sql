-- Create or update create_task_event RPC to support materials attachment
-- This function is used by TaskCreateModal to create events

-- Drop all existing versions of the function to avoid signature conflicts
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT oid::regprocedure as func_signature
    FROM pg_proc
    WHERE proname = 'create_task_event'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_task_event(
  _family_id uuid,
  _child_id uuid,
  _title text,
  _start_ts timestamptz,
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
  _resume_position text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event_id uuid;
  _calculated_minutes integer;
BEGIN
  -- Calculate minutes if not provided
  IF _minutes IS NULL AND _end_ts IS NOT NULL THEN
    _calculated_minutes := EXTRACT(EPOCH FROM (_end_ts - _start_ts)) / 60;
  ELSE
    _calculated_minutes := COALESCE(_minutes, 30);
  END IF;

  -- Insert event
  INSERT INTO events (
    family_id,
    child_id,
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
    created_at,
    updated_at
  ) VALUES (
    _family_id,
    _child_id,
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
    now(),
    now()
  )
  RETURNING id INTO _event_id;

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

COMMENT ON FUNCTION public.create_task_event IS 'Create an event with full metadata including materials attachment, source links, and resume position';

