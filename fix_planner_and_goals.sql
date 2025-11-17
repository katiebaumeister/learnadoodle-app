-- =====================================================
-- FIX PLANNER EVENTS AND GOALS DATA
-- 1. Create get_week_view RPC for Planner
-- 2. Add goals data for Lilly
-- =====================================================

-- 1. Create get_week_view RPC for Planner
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
  SELECT 'America/New_York' as timezone 
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
-- Get availability windows for each child/day
availability AS (
  SELECT 
    c.id as child_id,
    c.name as child_name,
    cdc.date,
    cdc.day_status,
    cdc.first_block_start,
    cdc.last_block_end,
    CASE 
      WHEN cdc.day_status = 'off' THEN '[]'::jsonb
      WHEN cdc.first_block_start IS NULL OR cdc.last_block_end IS NULL THEN '[]'::jsonb
      ELSE jsonb_build_array(
        jsonb_build_object(
          'start', cdc.first_block_start,
          'end', cdc.last_block_end,
          'status', cdc.day_status
        )
      )
    END as windows
  FROM children c
  CROSS JOIN generate_series(_from, _to, interval '1 day') as d(date)
  LEFT JOIN calendar_days_cache cdc ON cdc.child_id = c.id AND cdc.date = d.date
  WHERE c.family_id = _family_id
    AND (_child_ids IS NULL OR c.id = ANY(_child_ids))
),
-- Get events for the week
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
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS start_local,
    TO_CHAR((e.end_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS end_local,
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'YYYY-MM-DD') AS date_local
  FROM events e
  LEFT JOIN subject s ON s.id = e.subject_id
  WHERE e.family_id = _family_id
    AND e.start_ts >= (_from::timestamptz)
    AND e.start_ts < (_to::timestamptz)
    AND (_child_ids IS NULL OR e.child_id = ANY(_child_ids))
  ORDER BY e.start_ts
)
SELECT JSONB_BUILD_OBJECT(
  'children', (
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', c.id,
        'name', c.name,
        'grade', c.grade,
        'avatar', c.avatar
      ) ORDER BY c.name
    ), '[]'::jsonb) 
    FROM children c
  ),
  'avail', (
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'child_id', a.child_id,
        'child_name', a.child_name,
        'date', a.date,
        'day_status', a.day_status,
        'windows', a.windows
      ) ORDER BY a.child_id, a.date
    ), '[]'::jsonb) 
    FROM availability a
  ),
  'events', (
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', e.id,
        'child_id', e.child_id,
        'title', e.title,
        'description', e.description,
        'subject_id', e.subject_id,
        'subject_name', e.subject_name,
        'status', e.status,
        'start_ts', e.start_ts,
        'end_ts', e.end_ts,
        'duration_minutes', e.duration_minutes,
        'start_local', e.start_local,
        'end_local', e.end_local,
        'date_local', e.date_local
      ) ORDER BY e.start_ts
    ), '[]'::jsonb) 
    FROM events e
  ),
  'from', _from,
  'to', _to,
  'timezone', (SELECT timezone FROM fam)
);
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_week_view(UUID, DATE, DATE, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_week_view(UUID, DATE, DATE, UUID[]) TO anon;

-- 2. Add goals for Lilly (if subject_goals table exists) - SIMPLIFIED APPROACH
DO $$
DECLARE
  v_family_id TEXT := '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';
  v_lilly_id TEXT;
  v_subject_count INT;
  v_has_goal_minutes BOOLEAN := FALSE;
BEGIN
  -- Get Lilly's ID as text
  SELECT id::text INTO v_lilly_id 
  FROM children 
  WHERE family_id::text = v_family_id AND first_name = 'Lilly';
  
  IF v_lilly_id IS NOT NULL THEN
    -- Check if subject_goals table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subject_goals') THEN
      -- Check if goal_minutes_per_week column exists
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'subject_goals' 
        AND column_name = 'goal_minutes_per_week'
      ) INTO v_has_goal_minutes;
      
      -- Add goals for Lilly for each subject (using proper UUID casting)
      IF v_has_goal_minutes THEN
        INSERT INTO subject_goals (child_id, subject_id, goal_minutes_per_week)
        SELECT v_lilly_id::uuid, s.id::uuid, 120 -- 2 hours per week default
        FROM subject s
        WHERE s.family_id::text = v_family_id
          AND NOT EXISTS (
            SELECT 1 FROM subject_goals sg
            WHERE sg.child_id = v_lilly_id::uuid AND sg.subject_id = s.id::uuid
          );
      ELSE
        -- Just insert basic goal without goal_minutes_per_week
        INSERT INTO subject_goals (child_id, subject_id)
        SELECT v_lilly_id::uuid, s.id::uuid
        FROM subject s
        WHERE s.family_id::text = v_family_id
          AND NOT EXISTS (
            SELECT 1 FROM subject_goals sg
            WHERE sg.child_id = v_lilly_id::uuid AND sg.subject_id = s.id::uuid
          );
      END IF;
      
      -- Count how many goals were added
      GET DIAGNOSTICS v_subject_count = ROW_COUNT;
        
      RAISE NOTICE '✅ Added goals for Lilly: % subjects', v_subject_count;
    ELSE
      RAISE NOTICE '⚠️ subject_goals table does not exist - skipping goals creation';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Lilly not found - skipping goals creation';
  END IF;
END$$;

-- 3. Test both fixes
DO $$
DECLARE
  v_family_id UUID := '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';
  v_result JSONB;
  v_lilly_goals_count INT;
BEGIN
  RAISE NOTICE '╔════════════════════════════════════════╗';
  RAISE NOTICE '║  FIXING PLANNER AND GOALS              ║';
  RAISE NOTICE '╚════════════════════════════════════════╝';
  RAISE NOTICE '';
  
  -- Test get_week_view RPC
  SELECT get_week_view(
    v_family_id,
    CURRENT_DATE,
    CURRENT_DATE + 7,
    NULL
  ) INTO v_result;
  
  RAISE NOTICE '✅ get_week_view RPC: WORKING';
  RAISE NOTICE 'Children count: %', jsonb_array_length(v_result->'children');
  RAISE NOTICE 'Events count: %', jsonb_array_length(v_result->'events');
  RAISE NOTICE 'Availability entries: %', jsonb_array_length(v_result->'avail');
  
  -- Check Lilly's goals
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subject_goals') THEN
    SELECT COUNT(*) INTO v_lilly_goals_count
    FROM subject_goals sg
    JOIN children c ON c.id = sg.child_id
    WHERE c.family_id = v_family_id AND c.first_name = 'Lilly';
    
    RAISE NOTICE '✅ Lilly goals count: %', v_lilly_goals_count;
  ELSE
    RAISE NOTICE '⚠️ subject_goals table does not exist';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '🎉 PLANNER SHOULD NOW SHOW EVENTS!';
  RAISE NOTICE '🎉 LILLY SHOULD NOW HAVE GOALS!';
  
END$$;
