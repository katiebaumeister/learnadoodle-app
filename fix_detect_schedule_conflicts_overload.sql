-- Fix detect_schedule_conflicts to support both date and timestamp parameters
-- This adds an overloaded version that accepts timestamps and converts them to dates

-- Create overloaded version that accepts timestamps
CREATE OR REPLACE FUNCTION detect_schedule_conflicts(
  p_family_id uuid,
  p_start_date timestamp without time zone,
  p_end_date timestamp without time zone
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
  -- Convert timestamps to dates and call the original function
  RETURN QUERY
  SELECT * FROM detect_schedule_conflicts(
    p_family_id,
    DATE(p_start_date),
    DATE(p_end_date)
  );
END;
$$;

COMMENT ON FUNCTION detect_schedule_conflicts(uuid, timestamp without time zone, timestamp without time zone) IS 'Overloaded version that accepts timestamps and converts them to dates';

GRANT EXECUTE ON FUNCTION detect_schedule_conflicts(uuid, timestamp without time zone, timestamp without time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION detect_schedule_conflicts(uuid, timestamp without time zone, timestamp without time zone) TO service_role;
