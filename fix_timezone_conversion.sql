-- =====================================================
-- FIX TIMEZONE CONVERSION IN get_month_view RPC
-- The issue: Month view shows events at wrong times (5 AM instead of 9 AM)
-- =====================================================

-- Drop and recreate get_month_view with correct timezone handling
DROP FUNCTION IF EXISTS get_month_view(UUID, INTEGER, INTEGER, UUID[]);

CREATE OR REPLACE FUNCTION get_month_view(
  _family_id UUID,
  _year INTEGER,
  _month INTEGER,
  _child_ids UUID[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE SQL
STABLE
AS $$
WITH fam AS (
  SELECT 'America/New_York' as timezone 
),
bounds AS (
  SELECT
    DATE(_year || '-' || LPAD(_month::text, 2, '0') || '-01') AS month_start,
    (DATE(_year || '-' || LPAD(_month::text, 2, '0') || '-01') + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end
),
-- Get children (filtered by _child_ids if provided)
children AS (
  SELECT 
    id, 
    COALESCE(first_name, 'Child') as name,
    COALESCE(grade_level::text, grade::text) as grade, 
    avatar,
    family_id
  FROM children
  WHERE family_id = _family_id
    AND (_child_ids IS NULL OR id = ANY(_child_ids))
  ORDER BY COALESCE(first_name, 'Child')
),
-- Get events for the entire month
events AS (
  SELECT
    e.id,
    e.child_id,
    e.title,
    e.description,
    e.subject_id,
    s.name as subject_name,
    e.status,
    e.start_ts,
    e.end_ts,
    EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60 AS duration_minutes,
    -- FIXED: Use proper timezone conversion
    TO_CHAR((e.start_ts AT TIME ZONE 'UTC' AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS start_local,
    TO_CHAR((e.end_ts AT TIME ZONE 'UTC' AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS end_local,
    TO_CHAR((e.start_ts AT TIME ZONE 'UTC' AT TIME ZONE (SELECT timezone FROM fam)), 'YYYY-MM-DD') AS date_local,
    e.source,
    e.family_id
  FROM events e
  LEFT JOIN subject s ON s.id = e.subject_id
  WHERE e.family_id = _family_id
    AND e.start_ts >= ((SELECT month_start FROM bounds)::timestamptz)
    AND e.start_ts < ((SELECT month_end FROM bounds)::timestamptz + INTERVAL '1 day')
    AND (_child_ids IS NULL OR e.child_id = ANY(_child_ids))
  ORDER BY e.start_ts
),
-- Group events by date for calendar display
events_by_date AS (
  SELECT 
    date_local,
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', id,
        'child_id', child_id,
        'title', title,
        'description', description,
        'subject_id', subject_id,
        'subject_name', subject_name,
        'status', status,
        'start_ts', start_ts,
        'end_ts', end_ts,
        'duration_minutes', duration_minutes,
        'start_local', start_local,
        'end_local', end_local,
        'source', source
      ) ORDER BY start_local
    ) as day_events
  FROM events
  GROUP BY date_local
)
-- Return the final result
SELECT JSONB_BUILD_OBJECT(
  'year', _year,
  'month', _month,
  'children', COALESCE(JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT(
    'id', c.id,
    'name', c.name,
    'grade', c.grade,
    'avatar', c.avatar
  )), '[]'::jsonb),
  'timezone', (SELECT timezone FROM fam),
  'month_start', (SELECT month_start FROM bounds),
  'month_end', (SELECT month_end FROM bounds),
  'events_by_date', COALESCE(
    JSONB_OBJECT_AGG(date_local, day_events ORDER BY date_local),
    '{}'::jsonb
  )
)
FROM children c
CROSS JOIN events_by_date;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_month_view(UUID, INTEGER, INTEGER, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_month_view(UUID, INTEGER, INTEGER, UUID[]) TO anon;

-- Test the fixed function
DO $$
DECLARE
  test_result JSONB;
BEGIN
  SELECT get_month_view(
    '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'::uuid,
    2025,
    10,
    NULL
  ) INTO test_result;
  
  RAISE NOTICE 'Fixed get_month_view test:';
  RAISE NOTICE 'Sample events for 2025-10-21: %', 
    test_result->'events_by_date'->'2025-10-21'->0->>'title' || ' at ' || 
    test_result->'events_by_date'->'2025-10-21'->0->>'start_local';
END $$;
