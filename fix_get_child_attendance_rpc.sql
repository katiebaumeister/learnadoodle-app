-- Fix get_child_attendance RPC to use SECURITY DEFINER
-- This allows the function to bypass RLS when accessing attendance_exceptions

CREATE OR REPLACE FUNCTION get_child_attendance(
  p_child_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result JSONB;
BEGIN
  WITH school_days AS (
    SELECT d::date AS date
    FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS d
    WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
  ),
  event_attendance AS (
    SELECT 
      sd.date,
      COALESCE(SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::INT, 0) as minutes_present,
      CASE 
        WHEN COALESCE(SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::INT, 0) >= 300 THEN 'present'
        WHEN COALESCE(SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::INT, 0) >= 60 THEN 'tardy'
        ELSE 'absent'
      END as status
    FROM school_days sd
    LEFT JOIN events e ON e.child_id = p_child_id 
      AND e.status = 'done'
      AND (e.start_ts AT TIME ZONE 'UTC')::DATE = sd.date
    GROUP BY sd.date
  ),
  final_attendance AS (
    SELECT 
      ea.date,
      COALESCE(ae.status, ea.status) as status,
      COALESCE(ae.minutes_present, ea.minutes_present) as minutes_present,
      ae.notes,
      CASE WHEN ae.id IS NOT NULL THEN true ELSE false END as is_exception
    FROM event_attendance ea
    LEFT JOIN attendance_exceptions ae ON ae.child_id = p_child_id AND ae.date = ea.date
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', date,
      'status', status,
      'minutes_present', minutes_present,
      'notes', notes,
      'is_exception', is_exception
    ) ORDER BY date
  ) INTO result
  FROM final_attendance;
  
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Ensure permissions are granted
GRANT EXECUTE ON FUNCTION get_child_attendance(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_child_attendance(UUID, DATE, DATE) TO anon;

