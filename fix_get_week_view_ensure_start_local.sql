-- Fix get_week_view RPC to ensure start_local, end_local, and date_local are always returned
-- This fixes the hour offset issue in WeekGrid where events appear 1 hour early

-- Ensure helper function exists first
CREATE OR REPLACE FUNCTION get_family_timezone(p_family_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tz  text;
  v_has boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name  = 'family'
      AND column_name = 'timezone'
  ) INTO v_has;

  IF v_has THEN
    SELECT timezone INTO v_tz
    FROM family
    WHERE id = p_family_id;
  END IF;

  -- Default to America/New_York if not set or UTC
  RETURN COALESCE(NULLIF(v_tz, 'UTC'), 'America/New_York');
END;
$$;

-- Drop and recreate get_week_view with proper timezone handling
DROP FUNCTION IF EXISTS get_week_view(UUID, DATE, DATE, UUID[]);

CREATE OR REPLACE FUNCTION get_week_view(
  _family_id UUID,
  _from DATE,
  _to DATE,
  _child_ids UUID[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE SQL
STABLE
AS $$
WITH fam AS (
  SELECT get_family_timezone(_family_id) as timezone 
),
bounds AS (
  SELECT
    _from::date AS d0,
    _to::date AS d1
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
-- Get availability windows for each child/day (including pattern_day)
availability AS (
  SELECT 
    c.id as child_id,
    c.name as child_name,
    d.date,
    COALESCE(
      -- Check cache first
      cdc.day_status,
      -- Then check schedule_overrides for day_off
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM schedule_overrides o
          WHERE o.date = d.date
            AND o.is_active = true
            AND o.override_kind = 'day_off'
            AND (
              (o.scope_type = 'family' AND o.scope_id = _family_id)
              OR (o.scope_type = 'child' AND o.scope_id = c.id)
            )
        ) THEN 'off'
        ELSE NULL
      END
    ) as day_status,
    cdc.first_block_start,
    cdc.last_block_end,
    cdc.pattern_day,
    CASE 
      -- If day_status is 'off' (from cache or override), return empty windows
      WHEN COALESCE(
        cdc.day_status,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM schedule_overrides o
            WHERE o.date = d.date
              AND o.is_active = true
              AND o.override_kind = 'day_off'
              AND (
                (o.scope_type = 'family' AND o.scope_id = _family_id)
                OR (o.scope_type = 'child' AND o.scope_id = c.id)
              )
          ) THEN 'off'
          ELSE NULL
        END
      ) = 'off' THEN '[]'::jsonb
      WHEN cdc.first_block_start IS NULL OR cdc.last_block_end IS NULL THEN '[]'::jsonb
      ELSE jsonb_build_array(
        jsonb_build_object(
          'start', cdc.first_block_start,
          'end', cdc.last_block_end,
          'status', COALESCE(cdc.day_status, 'teach')
        )
      )
    END as windows
  FROM children c
  CROSS JOIN generate_series(_from, _to, interval '1 day') as d(date)
  LEFT JOIN calendar_days_cache cdc ON cdc.child_id = c.id AND cdc.date = d.date AND cdc.family_id = _family_id
  WHERE c.family_id = _family_id
    AND (_child_ids IS NULL OR c.id = ANY(_child_ids))
),
-- Get events for the week with timezone-aware local times
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
    e.year_plan_id,
    EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60 AS duration_minutes,
    -- CRITICAL: Convert timestamptz to family timezone and extract local time
    -- start_ts is already timestamptz (stored in UTC), so we convert directly to family timezone
    -- This ensures WeekGrid can position events correctly without timezone issues
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS start_local,
    TO_CHAR((e.end_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS end_local,
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'YYYY-MM-DD') AS date_local,
    e.source,
    e.family_id,
    e.pattern_day
  FROM events e
  LEFT JOIN subject s ON s.id = e.subject_id
  WHERE e.family_id = _family_id
    AND e.start_ts >= ((SELECT d0 FROM bounds)::timestamptz)
    AND e.start_ts < ((SELECT d1 FROM bounds)::timestamptz + INTERVAL '1 day')
    AND (_child_ids IS NULL OR e.child_id = ANY(_child_ids))
  ORDER BY e.start_ts
)
SELECT jsonb_build_object(
  'children', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'grade', c.grade,
    'avatar', c.avatar
  )) FROM children c), '[]'::jsonb),
  'avail', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'child_id', a.child_id,
    'child_name', a.child_name,
    'date', a.date,
    'day_status', a.day_status,
    'pattern_day', a.pattern_day,
    'windows', a.windows
  ) ORDER BY a.date, a.child_id) FROM availability a), '[]'::jsonb),
  'events', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', e.id,
    'child_id', e.child_id,
    'title', e.title,
    'description', e.description,
    'subject_id', e.subject_id,
    'subject_name', e.subject_name,
    'status', e.status,
    'start_ts', e.start_ts,
    'end_ts', e.end_ts,
    'year_plan_id', e.year_plan_id,
    'duration_minutes', e.duration_minutes,
    -- CRITICAL: These fields must be included for WeekGrid to work correctly
    'start_local', e.start_local,
    'end_local', e.end_local,
    'date_local', e.date_local,
    'source', e.source,
    'family_id', e.family_id,
    'pattern_day', e.pattern_day
  ) ORDER BY e.start_ts) FROM events e), '[]'::jsonb),
  'from', _from,
  'to', _to,
  'timezone', (SELECT timezone FROM fam)
);
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_week_view(UUID, DATE, DATE, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_week_view(UUID, DATE, DATE, UUID[]) TO anon;
GRANT EXECUTE ON FUNCTION get_week_view(UUID, DATE, DATE, UUID[]) TO service_role;

-- Test the function
DO $$
DECLARE
  v_family_id UUID := '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';
  v_result JSONB;
  v_sample_event JSONB;
BEGIN
  RAISE NOTICE '╔════════════════════════════════════════╗';
  RAISE NOTICE '║  FIXING get_week_view RPC              ║';
  RAISE NOTICE '╚════════════════════════════════════════╝';
  RAISE NOTICE '';
  
  -- Test the RPC
  SELECT get_week_view(
    v_family_id,
    CURRENT_DATE,
    CURRENT_DATE + 7,
    NULL
  ) INTO v_result;
  
  RAISE NOTICE '✅ get_week_view RPC: UPDATED';
  RAISE NOTICE 'Children count: %', jsonb_array_length(v_result->'children');
  RAISE NOTICE 'Events count: %', jsonb_array_length(v_result->'events');
  RAISE NOTICE 'Availability entries: %', jsonb_array_length(v_result->'avail');
  
  -- Check if start_local is being returned
  SELECT v_result->'events'->0 INTO v_sample_event;
  IF v_sample_event IS NOT NULL THEN
    RAISE NOTICE '';
    RAISE NOTICE 'Sample event fields:';
    RAISE NOTICE '  - start_local: %', v_sample_event->>'start_local';
    RAISE NOTICE '  - end_local: %', v_sample_event->>'end_local';
    RAISE NOTICE '  - date_local: %', v_sample_event->>'date_local';
    RAISE NOTICE '  - start_ts: %', v_sample_event->>'start_ts';
    
    IF v_sample_event->>'start_local' IS NULL THEN
      RAISE WARNING '⚠️  WARNING: start_local is NULL! WeekGrid will use timestamp fallback.';
    ELSE
      RAISE NOTICE '✅ start_local is present - WeekGrid should work correctly!';
    END IF;
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '🎉 RPC FUNCTION UPDATED - Week view should now show correct times!';
  
END$$;
