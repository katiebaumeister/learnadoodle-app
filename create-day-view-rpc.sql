-- RPC for Day View Drawer
-- Returns everything needed for a single day view

CREATE OR REPLACE FUNCTION get_day_view(
  _family_id UUID,
  _date DATE,
  _child_ids UUID[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE SQL
STABLE
AS $$
WITH kids AS (
  SELECT 
    id, 
    COALESCE(first_name, 'Child') AS name,
    grade
  FROM children
  WHERE family_id = _family_id
    AND (_child_ids IS NULL OR id = ANY(_child_ids))
  ORDER BY COALESCE(first_name, 'Child')
),
status AS (
  SELECT 
    child_id, 
    day_status, 
    first_block_start, 
    last_block_end
  FROM calendar_days_cache
  WHERE family_id = _family_id 
    AND date = _date
),
avail AS (
  SELECT 
    c.id AS child_id,
    ga.*
  FROM kids c
  JOIN LATERAL get_child_availability_windows(c.id, _date, _date + 1) ga ON true
),
ev_today AS (
  SELECT 
    e.id,
    e.child_id,
    e.title,
    e.status,
    e.subject_id, 
    s.name AS subject,
    e.start_ts, 
    e.end_ts,
    e.description
  FROM events e
  LEFT JOIN subject s ON s.id = e.subject_id
  WHERE e.family_id = _family_id
    AND e.start_ts >= _date::timestamptz
    AND e.start_ts < (_date + 1)::timestamptz
    AND (_child_ids IS NULL OR e.child_id = ANY(_child_ids))
  ORDER BY e.start_ts
),
ovr AS (
  -- Family-wide overrides
  SELECT 
    'family'::text AS scope_type,
    _family_id AS scope_id,
    o.override_kind,
    TO_CHAR(o.start_time, 'HH24:MI') AS start_time,
    TO_CHAR(o.end_time, 'HH24:MI') AS end_time,
    o.notes
  FROM schedule_overrides o
  WHERE o.scope_type = 'family' 
    AND o.scope_id = _family_id 
    AND o.date = _date
  
  UNION ALL
  
  -- Child-specific overrides
  SELECT 
    'child'::text,
    o.scope_id,
    o.override_kind,
    TO_CHAR(o.start_time, 'HH24:MI'),
    TO_CHAR(o.end_time, 'HH24:MI'),
    o.notes
  FROM schedule_overrides o
  JOIN kids k ON k.id = o.scope_id
  WHERE o.scope_type = 'child' 
    AND o.date = _date
),
mins AS (
  SELECT 
    child_id,
    SUM(EXTRACT(EPOCH FROM (end_ts - start_ts)) / 60) AS scheduled_min
  FROM ev_today
  WHERE status IN ('scheduled', 'done')
  GROUP BY child_id
)
SELECT JSONB_BUILD_OBJECT(
  'children', (
    SELECT COALESCE(JSONB_AGG(TO_JSONB(k)), '[]'::jsonb) 
    FROM kids k
  ),
  'availability', (
    SELECT COALESCE(JSONB_AGG(TO_JSONB(a)), '[]'::jsonb) 
    FROM avail a
  ),
  'events', (
    SELECT COALESCE(JSONB_AGG(TO_JSONB(e)), '[]'::jsonb) 
    FROM ev_today e
  ),
  'overrides', (
    SELECT COALESCE(JSONB_AGG(TO_JSONB(o)), '[]'::jsonb) 
    FROM ovr o
  ),
  'scheduled_minutes_today', (
    SELECT COALESCE(JSONB_AGG(TO_JSONB(m)), '[]'::jsonb) 
    FROM mins m
  )
);
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_day_view(UUID, DATE, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_day_view(UUID, DATE, UUID[]) TO anon;
