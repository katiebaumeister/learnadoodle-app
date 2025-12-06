-- Family Calendar Features Migration
-- Adds support for whole-family calendar, shared classes, conflict detection, and family events
-- Safe to run multiple times (IF NOT EXISTS guards)

-- ============================================================
-- 1. Shared Classes Support
-- ============================================================

-- Add shared_class_id to events table to link events that are part of a shared class
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS shared_class_id uuid;

-- Create shared_classes table for classes that multiple children attend together
CREATE TABLE IF NOT EXISTS shared_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  subject_id uuid REFERENCES subject(id) ON DELETE SET NULL,
  instructor text,
  location text,
  mode text CHECK (mode IN ('home', 'online', 'outside', 'travel')),
  recurrence_rule jsonb, -- RFC5545 format for recurring classes
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Create junction table for shared classes and children
CREATE TABLE IF NOT EXISTS shared_class_children (
  shared_class_id uuid NOT NULL REFERENCES shared_classes(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shared_class_id, child_id)
);

-- Add foreign key constraint for shared_class_id in events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'events_shared_class_id_fkey'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT events_shared_class_id_fkey
      FOREIGN KEY (shared_class_id) REFERENCES shared_classes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add child_ids array to events for family events (events that affect multiple children)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS child_ids uuid[] DEFAULT '{}';

-- Update event_type constraint to include 'Family Event'
DO $$
BEGIN
  -- Check if constraint exists and drop it
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'events_event_type_check'
  ) THEN
    ALTER TABLE events DROP CONSTRAINT events_event_type_check;
  END IF;
END $$;

-- Add new constraint with Family Event type
-- Note: This assumes event_type already exists. If not, we'll add it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'event_type'
  ) THEN
    ALTER TABLE events ADD COLUMN event_type text;
  END IF;
END $$;

-- Add constraint for event_type values
ALTER TABLE events
  ADD CONSTRAINT events_event_type_check 
  CHECK (event_type IS NULL OR event_type IN (
    'Appointment', 'Travel', 'Live Class', 'Home Lesson', 'Core Class', 
    'Activity', 'Sport', 'Assessment', 'Meeting', 'Family Event'
  ));

-- ============================================================
-- 2. Indexes for Performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_shared_classes_family ON shared_classes(family_id);
CREATE INDEX IF NOT EXISTS idx_shared_classes_subject ON shared_classes(subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shared_class_children_class ON shared_class_children(shared_class_id);
CREATE INDEX IF NOT EXISTS idx_shared_class_children_child ON shared_class_children(child_id);
CREATE INDEX IF NOT EXISTS idx_events_shared_class ON events(shared_class_id) WHERE shared_class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_child_ids ON events USING GIN(child_ids) WHERE array_length(child_ids, 1) > 0;
CREATE INDEX IF NOT EXISTS idx_events_family_event ON events(family_id, event_type) WHERE event_type = 'Family Event';

-- ============================================================
-- 3. Conflict Detection Function
-- ============================================================

CREATE OR REPLACE FUNCTION detect_schedule_conflicts(
  p_family_id uuid,
  p_start_date date DEFAULT CURRENT_DATE,
  p_end_date date DEFAULT CURRENT_DATE + INTERVAL '30 days'
)
RETURNS TABLE (
  conflict_id uuid,
  child_id_1 uuid,
  child_id_2 uuid,
  event_id_1 uuid,
  event_id_2 uuid,
  conflict_date date,
  conflict_start timestamptz,
  conflict_end timestamptz,
  severity text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH child_events AS (
    SELECT 
      e.id as event_id,
      e.child_id,
      e.child_ids,
      e.family_id,
      e.start_ts,
      e.end_ts,
      e.title,
      e.status,
      DATE(e.start_ts) as event_date
    FROM events e
    WHERE e.family_id = p_family_id
      AND e.status != 'canceled'
      AND e.canceled_at IS NULL
      AND DATE(e.start_ts) BETWEEN p_start_date AND p_end_date
      AND (
        e.child_id IS NOT NULL OR 
        array_length(e.child_ids, 1) > 0 OR
        e.shared_class_id IS NOT NULL
      )
  ),
  -- Get all children involved in events
  all_child_events AS (
    SELECT 
      ce.event_id,
      ce.family_id,
      ce.start_ts,
      ce.end_ts,
      ce.title,
      ce.status,
      ce.event_date,
      COALESCE(ce.child_id, unnest(ce.child_ids)) as child_id
    FROM child_events ce
    WHERE ce.child_id IS NOT NULL
  ),
  -- Find overlapping events for the same child
  conflicts AS (
    SELECT DISTINCT
      gen_random_uuid() as conflict_id,
      a1.child_id as child_id_1,
      a1.child_id as child_id_2,
      a1.event_id as event_id_1,
      a2.event_id as event_id_2,
      a1.event_date as conflict_date,
      GREATEST(a1.start_ts, a2.start_ts) as conflict_start,
      LEAST(a1.end_ts, a2.end_ts) as conflict_end,
      CASE 
        WHEN a1.start_ts < a2.end_ts AND a1.end_ts > a2.start_ts THEN 'overlap'
        ELSE 'adjacent'
      END as severity
    FROM all_child_events a1
    JOIN all_child_events a2 ON 
      a1.child_id = a2.child_id
      AND a1.event_id < a2.event_id
      AND a1.start_ts < a2.end_ts
      AND a1.end_ts > a2.start_ts
  )
  SELECT * FROM conflicts
  ORDER BY conflict_date, conflict_start;
END;
$$;

COMMENT ON FUNCTION detect_schedule_conflicts IS 'Detects scheduling conflicts between children in a family within a date range';

-- ============================================================
-- 4. Cross-Child Coordination Function
-- ============================================================

CREATE OR REPLACE FUNCTION coordinate_family_schedule(
  p_family_id uuid,
  p_event_id uuid,
  p_action text -- 'add', 'update', 'delete'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event events%ROWTYPE;
  v_affected_children uuid[];
  v_conflicts jsonb;
  v_result jsonb;
BEGIN
  -- Get event details
  SELECT * INTO v_event
  FROM events
  WHERE id = p_event_id AND family_id = p_family_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Event not found'
    );
  END IF;
  
  -- Determine affected children
  IF v_event.child_id IS NOT NULL THEN
    v_affected_children := ARRAY[v_event.child_id];
  ELSIF array_length(v_event.child_ids, 1) > 0 THEN
    v_affected_children := v_event.child_ids;
  ELSIF v_event.shared_class_id IS NOT NULL THEN
    SELECT ARRAY_AGG(child_id) INTO v_affected_children
    FROM shared_class_children
    WHERE shared_class_id = v_event.shared_class_id;
  ELSE
    -- Family event - get all children in family
    SELECT ARRAY_AGG(id) INTO v_affected_children
    FROM children
    WHERE family_id = p_family_id;
  END IF;
  
  -- Check for conflicts
  SELECT jsonb_agg(
    jsonb_build_object(
      'child_id', child_id_1,
      'event_id_1', event_id_1,
      'event_id_2', event_id_2,
      'conflict_date', conflict_date,
      'conflict_start', conflict_start,
      'conflict_end', conflict_end,
      'severity', severity
    )
  ) INTO v_conflicts
  FROM detect_schedule_conflicts(
    p_family_id,
    DATE(v_event.start_ts) - INTERVAL '7 days',
    DATE(v_event.end_ts) + INTERVAL '7 days'
  )
  WHERE child_id_1 = ANY(v_affected_children)
     OR child_id_2 = ANY(v_affected_children);
  
  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'action', p_action,
    'affected_children', v_affected_children,
    'conflicts', COALESCE(v_conflicts, '[]'::jsonb),
    'recommendations', CASE
      WHEN v_conflicts IS NOT NULL AND jsonb_array_length(v_conflicts) > 0 THEN
        jsonb_build_array(
          'Consider rescheduling conflicting events',
          'Review family availability for the affected time period'
        )
      ELSE
        '[]'::jsonb
    END
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION coordinate_family_schedule IS 'Coordinates family schedule changes and detects conflicts when events are added, updated, or deleted';

-- ============================================================
-- 5. Automatic Schedule Adjustment Function
-- ============================================================

CREATE OR REPLACE FUNCTION auto_adjust_family_schedule(
  p_family_id uuid,
  p_family_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_family_event events%ROWTYPE;
  v_affected_children uuid[];
  v_adjusted_events uuid[];
  v_result jsonb;
BEGIN
  -- Get family event details
  SELECT * INTO v_family_event
  FROM events
  WHERE id = p_family_event_id 
    AND family_id = p_family_id
    AND (event_type = 'Family Event' OR array_length(child_ids, 1) > 0);
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Family event not found'
    );
  END IF;
  
  -- Get affected children
  IF array_length(v_family_event.child_ids, 1) > 0 THEN
    v_affected_children := v_family_event.child_ids;
  ELSE
    SELECT ARRAY_AGG(id) INTO v_affected_children
    FROM children
    WHERE family_id = p_family_id;
  END IF;
  
  -- Find conflicting events for affected children
  WITH conflicting_events AS (
    SELECT DISTINCT e.id
    FROM events e
    WHERE e.family_id = p_family_id
      AND e.status = 'scheduled'
      AND e.canceled_at IS NULL
      AND (
        e.child_id = ANY(v_affected_children) OR
        e.child_ids && v_affected_children
      )
      AND e.start_ts < v_family_event.end_ts
      AND e.end_ts > v_family_event.start_ts
      AND e.id != p_family_event_id
  )
  SELECT ARRAY_AGG(id) INTO v_adjusted_events
  FROM conflicting_events;
  
  -- Build result with recommendations
  v_result := jsonb_build_object(
    'success', true,
    'family_event_id', p_family_event_id,
    'affected_children', v_affected_children,
    'conflicting_events', COALESCE(v_adjusted_events, ARRAY[]::uuid[]),
    'recommendations', CASE
      WHEN v_adjusted_events IS NOT NULL AND array_length(v_adjusted_events, 1) > 0 THEN
        jsonb_build_array(
          format('Found %s conflicting event(s) that may need rescheduling', array_length(v_adjusted_events, 1)),
          'Review and adjust individual child schedules as needed'
        )
      ELSE
        '[]'::jsonb
    END
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION auto_adjust_family_schedule IS 'Automatically detects and suggests adjustments when family events are added or changed';

-- ============================================================
-- 6. RLS Policies
-- ============================================================

-- Shared Classes
ALTER TABLE shared_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_shared_classes ON shared_classes;
CREATE POLICY family_read_shared_classes
ON shared_classes
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_manage_shared_classes ON shared_classes;
CREATE POLICY family_manage_shared_classes
ON shared_classes
FOR ALL
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

-- Shared Class Children
ALTER TABLE shared_class_children ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_shared_class_children ON shared_class_children;
CREATE POLICY family_read_shared_class_children
ON shared_class_children
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM shared_classes sc
    WHERE sc.id = shared_class_children.shared_class_id
    AND is_family_member(sc.family_id)
  )
);

DROP POLICY IF EXISTS family_manage_shared_class_children ON shared_class_children;
CREATE POLICY family_manage_shared_class_children
ON shared_class_children
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM shared_classes sc
    WHERE sc.id = shared_class_children.shared_class_id
    AND is_family_member(sc.family_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM shared_classes sc
    WHERE sc.id = shared_class_children.shared_class_id
    AND is_family_member(sc.family_id)
  )
);

-- ============================================================
-- 7. Grants
-- ============================================================

GRANT EXECUTE ON FUNCTION detect_schedule_conflicts TO authenticated;
GRANT EXECUTE ON FUNCTION coordinate_family_schedule TO authenticated;
GRANT EXECUTE ON FUNCTION auto_adjust_family_schedule TO authenticated;

-- ============================================================
-- 8. Comments
-- ============================================================

COMMENT ON COLUMN events.shared_class_id IS 'Links event to a shared class that multiple children attend';
COMMENT ON COLUMN events.child_ids IS 'Array of child IDs for family events that affect multiple children';
COMMENT ON TABLE shared_classes IS 'Classes that multiple children in a family attend together (e.g., history for all three kids)';
COMMENT ON TABLE shared_class_children IS 'Junction table linking shared classes to children';

-- ============================================================
-- 9. Update create_task_event to support family events and shared classes
-- ============================================================

-- Drop existing create_task_event function
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

-- Create enhanced version with family event and shared class support
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
BEGIN
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

  -- Check for conflicts and coordinate schedule
  PERFORM coordinate_family_schedule(_family_id, _event_id, 'add');

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

COMMENT ON FUNCTION public.create_task_event IS 'Create an event with support for family events (multiple children), shared classes, and full metadata';

