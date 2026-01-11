-- Fix detect_schedule_conflicts: Complete fix in a transaction
-- This ensures all operations happen atomically

BEGIN;

-- Step 1: Drop coordinate_family_schedule first (it depends on detect_schedule_conflicts)
DROP FUNCTION IF EXISTS public.coordinate_family_schedule(uuid, uuid, text) CASCADE;

-- Step 2: Drop all versions of detect_schedule_conflicts
-- Use explicit signatures
DROP FUNCTION IF EXISTS public.detect_schedule_conflicts(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS public.detect_schedule_conflicts(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS public.detect_schedule_conflicts(uuid, timestamp without time zone, timestamp without time zone) CASCADE;
DROP FUNCTION IF EXISTS public.detect_schedule_conflicts(uuid, timestamptz, timestamptz) CASCADE;

-- Also try dropping without schema qualifier
DROP FUNCTION IF EXISTS detect_schedule_conflicts(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS detect_schedule_conflicts(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS detect_schedule_conflicts(uuid, timestamp without time zone, timestamp without time zone) CASCADE;
DROP FUNCTION IF EXISTS detect_schedule_conflicts(uuid, timestamptz, timestamptz) CASCADE;

-- Step 3: Use DO block to catch any remaining versions
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT 
      oid::regprocedure::text as func_signature
    FROM pg_proc
    WHERE proname = 'detect_schedule_conflicts'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;
END $$;

-- Step 4: Create the single function using CREATE OR REPLACE with explicit signature
CREATE OR REPLACE FUNCTION public.detect_schedule_conflicts(
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
SET search_path = public
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
  -- Fix: Handle child_id and child_ids separately instead of using COALESCE with unnest
  all_child_events AS (
    -- Events with single child_id
    SELECT 
      ce.event_id,
      ce.family_id,
      ce.start_ts,
      ce.end_ts,
      ce.title,
      ce.status,
      ce.event_date,
      ce.child_id
    FROM child_events ce
    WHERE ce.child_id IS NOT NULL
    
    UNION ALL
    
    -- Events with child_ids array (unnest separately)
    SELECT 
      ce.event_id,
      ce.family_id,
      ce.start_ts,
      ce.end_ts,
      ce.title,
      ce.status,
      ce.event_date,
      unnest(ce.child_ids) as child_id
    FROM child_events ce
    WHERE ce.child_id IS NULL 
      AND ce.child_ids IS NOT NULL 
      AND array_length(ce.child_ids, 1) > 0
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

-- Step 5: Recreate coordinate_family_schedule with explicit function call
CREATE OR REPLACE FUNCTION public.coordinate_family_schedule(
  p_family_id uuid,
  p_event_id uuid,
  p_action text -- 'add', 'update', 'delete'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  
  -- Check for conflicts - use explicit function signature
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
  FROM public.detect_schedule_conflicts(
    p_family_id::uuid,
    (DATE(v_event.start_ts) - INTERVAL '7 days')::date,
    (DATE(v_event.end_ts) + INTERVAL '7 days')::date
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

-- Step 6: Grant permissions
GRANT EXECUTE ON FUNCTION public.detect_schedule_conflicts(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_schedule_conflicts(uuid, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.coordinate_family_schedule(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordinate_family_schedule(uuid, uuid, text) TO service_role;

-- Step 7: Add comments
COMMENT ON FUNCTION public.detect_schedule_conflicts(uuid, date, date) IS 'Detects scheduling conflicts between children in a family within a date range';
COMMENT ON FUNCTION public.coordinate_family_schedule(uuid, uuid, text) IS 'Coordinates family schedule changes and detects conflicts when events are added, updated, or deleted';

COMMIT;
