-- Fix detect_schedule_conflicts: Remove COALESCE with set-returning function
-- Robust version that explicitly drops all known signatures

-- Explicitly drop all known versions of detect_schedule_conflicts
DROP FUNCTION IF EXISTS detect_schedule_conflicts(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS detect_schedule_conflicts(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS detect_schedule_conflicts(uuid, timestamp without time zone, timestamp without time zone) CASCADE;
DROP FUNCTION IF EXISTS detect_schedule_conflicts(uuid, timestamptz, timestamptz) CASCADE;

-- Also drop any remaining versions using a DO block
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT oid::regprocedure as func_signature
    FROM pg_proc
    WHERE proname = 'detect_schedule_conflicts'
      AND pronamespace = 'public'::regnamespace
  LOOP
    BEGIN
      EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
    EXCEPTION WHEN OTHERS THEN
      -- Ignore errors if function doesn't exist
      NULL;
    END;
  END LOOP;
END $$;

-- Create a single function that accepts date (which will auto-coerce from timestamp)
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

-- Grant permissions with explicit signature
GRANT EXECUTE ON FUNCTION public.detect_schedule_conflicts(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_schedule_conflicts(uuid, date, date) TO service_role;

-- Add comment with explicit signature
COMMENT ON FUNCTION public.detect_schedule_conflicts(uuid, date, date) IS 'Detects scheduling conflicts between children in a family within a date range. Accepts date parameters (timestamps will be auto-coerced to date)';

