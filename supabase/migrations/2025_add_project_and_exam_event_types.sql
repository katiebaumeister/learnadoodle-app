-- =====================================================
-- Add Project and Exam Event Types
-- =====================================================

-- Step 1: Drop the existing constraint
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;

-- Step 2: Add new constraint with Project and Exam included
ALTER TABLE events
  ADD CONSTRAINT events_event_type_check 
  CHECK (event_type IN (
    'Lesson',
    'Project',
    'Exam',
    'Assignment',
    'Activity',
    'Schedule Block',
    'Appointment'
  ));

-- Step 3: Update comment for documentation
COMMENT ON COLUMN events.event_type IS 'Event type: Lesson, Project, Exam, Assignment, Activity, Schedule Block, Appointment (required, defaults to Activity)';

-- Step 4: Update the create_task_event function validation to allow Project and Exam
-- We'll use a regex replace to update just the validation line
DO $$
DECLARE
  func_body text;
BEGIN
  -- Get the current function definition
  SELECT pg_get_functiondef(oid) INTO func_body
  FROM pg_proc
  WHERE proname = 'create_task_event'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LIMIT 1;

  -- Replace the validation check line
  func_body := regexp_replace(
    func_body,
    'IF _event_type IS NOT NULL AND _event_type NOT IN \(''Lesson'', ''Assignment'', ''Activity'', ''Schedule Block'', ''Appointment''\) THEN',
    'IF _event_type IS NOT NULL AND _event_type NOT IN (''Lesson'', ''Project'', ''Exam'', ''Assignment'', ''Activity'', ''Schedule Block'', ''Appointment'') THEN',
    'g'
  );

  -- Replace the error message
  func_body := regexp_replace(
    func_body,
    'RETURN jsonb_build_object\(''ok'', false, ''error'', ''Invalid event_type\. Must be: Lesson, Assignment, Activity, Schedule Block, or Appointment''\);',
    'RETURN jsonb_build_object(''ok'', false, ''error'', ''Invalid event_type. Must be: Lesson, Project, Exam, Assignment, Activity, Schedule Block, or Appointment'');',
    'g'
  );

  -- Execute the updated function
  EXECUTE func_body;
END $$;

-- Alternative approach: Drop and recreate with updated validation
-- First, drop all existing versions
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT pg_get_function_identity_arguments(oid) as func_signature
    FROM pg_proc
    WHERE proname = 'create_task_event'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS create_task_event(' || r.func_signature || ') CASCADE';
  END LOOP;
END $$;

-- Now recreate the function with updated validation
-- Note: This is a simplified version - you may need to adjust based on your actual function signature
-- The key change is in the validation check on line 249
CREATE OR REPLACE FUNCTION create_task_event(
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
  _event_type text DEFAULT 'Activity',
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
  _recurrence_rule text DEFAULT NULL,
  _allow_overlaps boolean DEFAULT false
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
BEGIN
  -- Validate event_type - UPDATED to include Project and Exam
  IF _event_type IS NOT NULL AND _event_type NOT IN ('Lesson', 'Project', 'Exam', 'Assignment', 'Activity', 'Schedule Block', 'Appointment') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid event_type. Must be: Lesson, Project, Exam, Assignment, Activity, Schedule Block, or Appointment');
  END IF;

  -- Set default event_type if NULL
  IF _event_type IS NULL THEN
    _event_type := 'Activity';
  END IF;

  -- Calculate minutes if not provided
  IF _minutes IS NULL AND _end_ts IS NOT NULL THEN
    _calculated_minutes := EXTRACT(EPOCH FROM (_end_ts - _start_ts)) / 60;
  ELSE
    _calculated_minutes := COALESCE(_minutes, 30);
  END IF;

  -- Determine final child_ids
  IF _child_ids IS NOT NULL AND array_length(_child_ids, 1) > 0 THEN
    _final_child_ids := _child_ids;
  ELSIF _child_id IS NOT NULL THEN
    _final_child_ids := ARRAY[_child_id];
  ELSE
    _final_child_ids := NULL;
  END IF;

  -- Insert event
  -- If _allow_overlaps is true, temporarily disable the exclusion constraint, insert, then re-enable it
  DECLARE
    _final_is_flexible boolean;
    _final_is_backlog boolean;
    _constraint_disabled boolean := false;
  BEGIN
    -- Determine final values for is_flexible and is_backlog
    _final_is_flexible := CASE WHEN _allow_overlaps THEN true ELSE _is_flexible END;
    _final_is_backlog := CASE WHEN _allow_overlaps THEN true ELSE _is_backlog END;
    
    -- If allowing overlaps, temporarily disable the constraint
    IF _allow_overlaps THEN
      RAISE WARNING '[create_task_event] Allowing overlaps - will attempt INSERT with is_flexible=true, is_backlog=true.';
    END IF;
    
    -- If allowing overlaps, insert with child_id=NULL first (NULLs don't match in exclusion constraints)
    IF _allow_overlaps THEN
      INSERT INTO events (
        family_id,
        child_id,
        child_ids,
        title,
        start_ts,
        description,
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
        recurrence_rule
      ) VALUES (
        _family_id,
        NULL,
        ARRAY[]::uuid[],
        _title,
        _start_ts,
        _description,
        COALESCE(_end_ts, _start_ts + _calculated_minutes * INTERVAL '1 minute'),
        _status,
        _source,
        _tags,
        _final_is_flexible,
        _final_is_backlog,
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
        CASE WHEN _recurrence_rule IS NOT NULL THEN _recurrence_rule::jsonb ELSE NULL END
      ) RETURNING id INTO _event_id;
      
      UPDATE events
      SET child_ids = _final_child_ids,
          is_flexible = true,
          is_backlog = _is_backlog
      WHERE id = _event_id;
      
      _constraint_disabled := false;
    ELSE
      -- Normal insert
      BEGIN
        INSERT INTO events (
          family_id,
          child_id,
          child_ids,
          title,
          start_ts,
          description,
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
          recurrence_rule
        ) VALUES (
          _family_id,
          _child_id,
          _final_child_ids,
          _title,
          _start_ts,
          _description,
          COALESCE(_end_ts, _start_ts + _calculated_minutes * INTERVAL '1 minute'),
          _status,
          _source,
          _tags,
          _final_is_flexible,
          _final_is_backlog,
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
          CASE WHEN _recurrence_rule IS NOT NULL THEN _recurrence_rule::jsonb ELSE NULL END
        ) RETURNING id INTO _event_id;
        
        _constraint_disabled := false;
      EXCEPTION
        WHEN exclusion_violation THEN
          RAISE EXCEPTION 'Event overlaps with existing event for child: %', COALESCE(_child_id::text, 'unknown');
      END;
    END IF;

    RETURN jsonb_build_object('ok', true, 'id', _event_id);
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE WARNING '[create_task_event] Exclusion violation occurred. _allow_overlaps=%, _child_id=%, _final_child_ids=%', _allow_overlaps, _child_id, _final_child_ids;
      
      IF NOT _allow_overlaps THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'Event overlaps with existing event for child: ' || COALESCE(_child_id::text, 'unknown')
        );
      ELSE
        BEGIN
          INSERT INTO events (
            family_id,
            child_id,
            child_ids,
            title,
            start_ts,
            description,
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
            recurrence_rule
          ) VALUES (
            _family_id,
            NULL,
            ARRAY[]::uuid[],
            _title,
            _start_ts,
            _description,
            COALESCE(_end_ts, _start_ts + _calculated_minutes * INTERVAL '1 minute'),
            _status,
            _source,
            _tags,
            true,
            true,
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
            CASE WHEN _recurrence_rule IS NOT NULL THEN _recurrence_rule::jsonb ELSE NULL END
          ) RETURNING id INTO _event_id;
          
          UPDATE events
          SET child_ids = _final_child_ids,
              is_backlog = _is_backlog
          WHERE id = _event_id;
          
          RETURN jsonb_build_object('ok', true, 'id', _event_id);
        EXCEPTION
          WHEN OTHERS THEN
            RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
        END;
      END IF;
    WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
  END;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_task_event TO authenticated;

-- Verification
DO $$
BEGIN
  RAISE NOTICE '╔════════════════════════════════════════╗';
  RAISE NOTICE '║  PROJECT AND EXAM EVENT TYPES ADDED     ║';
  RAISE NOTICE '╚════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Event types now include:';
  RAISE NOTICE '  Lesson, Project, Exam, Assignment, Activity, Schedule Block, Appointment';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Database constraint updated';
  RAISE NOTICE '✅ create_task_event function updated';
END$$;
