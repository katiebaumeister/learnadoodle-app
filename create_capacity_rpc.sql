-- Capacity RPC for Reports KPI
-- Returns scheduled vs available minutes for a family/week

CREATE OR REPLACE FUNCTION get_capacity(
  _family_id UUID,
  _week_start DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  _week_end DATE;
  result JSONB;
BEGIN
  _week_end := _week_start + INTERVAL '6 days';
  
  WITH family_children AS (
    SELECT id FROM children WHERE family_id = _family_id
  ),
  available_minutes AS (
    SELECT COALESCE(
      SUM(
        EXTRACT(EPOCH FROM (cdc.last_block_end - cdc.first_block_start))::INT / 60
      ), 0
    )::INT AS total_available
    FROM calendar_days_cache cdc
    INNER JOIN family_children fc ON cdc.child_id = fc.id
    WHERE cdc.date >= _week_start 
      AND cdc.date <= _week_end
      AND cdc.day_status IN ('teach', 'partial')
  ),
  scheduled_minutes AS (
    SELECT COALESCE(
      SUM(
        EXTRACT(EPOCH FROM (e.end_ts - e.start_ts))::INT / 60
      ), 0
    )::INT AS total_scheduled
    FROM events e
    INNER JOIN family_children fc ON e.child_id = fc.id
    WHERE (e.start_ts AT TIME ZONE 'UTC')::DATE >= _week_start
      AND (e.start_ts AT TIME ZONE 'UTC')::DATE <= _week_end
      AND e.status IN ('scheduled', 'done')
  )
  SELECT jsonb_build_object(
    'available_minutes', (SELECT total_available FROM available_minutes),
    'scheduled_minutes', (SELECT total_scheduled FROM scheduled_minutes),
    'utilization_percent', CASE 
      WHEN (SELECT total_available FROM available_minutes) > 0 
      THEN ROUND(
        ((SELECT total_scheduled FROM scheduled_minutes)::numeric / 
         (SELECT total_available FROM available_minutes)::numeric) * 100, 
        1
      )
      ELSE 0
    END,
    'week_start', _week_start,
    'week_end', _week_end
  ) INTO result
  FROM available_minutes, scheduled_minutes;
  
  RETURN result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_capacity(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_capacity(UUID, DATE) TO anon;

