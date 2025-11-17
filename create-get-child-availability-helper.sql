-- Helper function: get_child_availability_windows
-- Wrapper around existing get_child_availability that returns windows as JSONB
-- Note: The existing get_child_availability function uses different parameter names

CREATE OR REPLACE FUNCTION public.get_child_availability_windows(
  _child UUID,
  _from DATE,
  _to DATE
) RETURNS TABLE (
  date DATE,
  day_status TEXT,
  windows JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ca.date,
    ca.day_status,
    ca.available_blocks AS windows
  FROM get_child_availability(_child, _from, _to) ca
  ORDER BY ca.date;
END;
$$;

-- Grant permissions for the wrapper
GRANT EXECUTE ON FUNCTION public.get_child_availability_windows(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_child_availability_windows(UUID, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_child_availability_windows(UUID, DATE, DATE) TO anon;

-- Create helpful indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_family_start ON events(family_id, start_ts);
CREATE INDEX IF NOT EXISTS idx_events_child_start ON events(child_id, start_ts);
CREATE INDEX IF NOT EXISTS idx_children_family ON children(family_id);
CREATE INDEX IF NOT EXISTS idx_calendar_days_cache_child_date ON calendar_days_cache(child_id, date);
CREATE INDEX IF NOT EXISTS idx_calendar_days_cache_family_date ON calendar_days_cache(family_id, date);
