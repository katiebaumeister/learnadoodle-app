-- Force fix: Drop everything and recreate from scratch
-- Run check_detect_schedule_conflicts.sql first to see what exists

-- Drop coordinate_family_schedule
DROP FUNCTION IF EXISTS public.coordinate_family_schedule CASCADE;

-- Force drop all detect_schedule_conflicts functions by signature
DO $$
DECLARE
  func_record RECORD;
  drop_stmt TEXT;
BEGIN
  -- Get all functions with this name
  FOR func_record IN
    SELECT 
      p.oid,
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args,
      p.oid::regprocedure::text as full_name
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'detect_schedule_conflicts'
      AND n.nspname = 'public'
  LOOP
    drop_stmt := 'DROP FUNCTION IF EXISTS ' || func_record.full_name || ' CASCADE';
    RAISE NOTICE 'Executing: %', drop_stmt;
    EXECUTE drop_stmt;
  END LOOP;
END $$;

-- Verify all are dropped (should return 0 rows)
DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_count
  FROM pg_proc
  WHERE proname = 'detect_schedule_conflicts'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
  
  IF remaining_count > 0 THEN
    RAISE EXCEPTION 'Still % function(s) remaining after drop', remaining_count;
  END IF;
  
  RAISE NOTICE 'All detect_schedule_conflicts functions dropped successfully';
END $$;

-- Now create the single function
CREATE FUNCTION public.detect_schedule_conflicts(
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
  all_child_events AS (
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

-- Recreate coordinate_family_schedule
CREATE OR REPLACE FUNCTION public.coordinate_family_schedule(
  p_family_id uuid,
  p_event_id uuid,
  p_action text
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
  SELECT * INTO v_event
  FROM events
  WHERE id = p_event_id AND family_id = p_family_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;
  
  IF v_event.child_id IS NOT NULL THEN
    v_affected_children := ARRAY[v_event.child_id];
  ELSIF array_length(v_event.child_ids, 1) > 0 THEN
    v_affected_children := v_event.child_ids;
  ELSIF v_event.shared_class_id IS NOT NULL THEN
    SELECT ARRAY_AGG(child_id) INTO v_affected_children
    FROM shared_class_children
    WHERE shared_class_id = v_event.shared_class_id;
  ELSE
    SELECT ARRAY_AGG(id) INTO v_affected_children
    FROM children
    WHERE family_id = p_family_id;
  END IF;
  
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
    p_family_id,
    (DATE(v_event.start_ts) - INTERVAL '7 days')::date,
    (DATE(v_event.end_ts) + INTERVAL '7 days')::date
  )
  WHERE child_id_1 = ANY(v_affected_children)
     OR child_id_2 = ANY(v_affected_children);
  
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
      ELSE '[]'::jsonb
    END
  );
  
  RETURN v_result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.detect_schedule_conflicts(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_schedule_conflicts(uuid, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.coordinate_family_schedule(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordinate_family_schedule(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.detect_schedule_conflicts(uuid, date, date) IS 'Detects scheduling conflicts between children in a family within a date range';
COMMENT ON FUNCTION public.coordinate_family_schedule(uuid, uuid, text) IS 'Coordinates family schedule changes and detects conflicts when events are added, updated, or deleted';

