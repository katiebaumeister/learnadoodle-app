-- Fix get_month_view to use family timezone (same as get_week_view)
-- This ensures month view and week view show consistent times

-- Ensure helper function exists first (same as get_week_view)
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

  RETURN COALESCE(v_tz, 'UTC');
END;
$$;

DROP FUNCTION IF EXISTS get_month_view(UUID, INTEGER, INTEGER, UUID[]);

CREATE OR REPLACE FUNCTION get_month_view(
  _family_id UUID,
  _year INTEGER,
  _month INTEGER,
  _child_ids UUID[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone TEXT;
BEGIN
  -- Get family timezone using helper function (same as get_week_view)
  SELECT get_family_timezone(_family_id) INTO v_timezone;
  
  -- Default to America/New_York if not set (or if explicitly UTC, which usually means "not set")
  IF v_timezone IS NULL OR v_timezone = 'UTC' OR v_timezone = '' THEN
    v_timezone := 'America/New_York';
  END IF;

  RETURN (
    WITH bounds AS (
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
        -- Use family timezone (same as get_week_view)
        TO_CHAR((e.start_ts AT TIME ZONE v_timezone), 'HH24:MI') AS start_local,
        TO_CHAR((e.end_ts AT TIME ZONE v_timezone), 'HH24:MI') AS end_local,
        TO_CHAR((e.start_ts AT TIME ZONE v_timezone), 'YYYY-MM-DD') AS date_local,
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
      'timezone', v_timezone,
      'month_start', (SELECT month_start FROM bounds),
      'month_end', (SELECT month_end FROM bounds),
      'events_by_date', COALESCE(
        JSONB_OBJECT_AGG(date_local, day_events ORDER BY date_local),
        '{}'::jsonb
      )
    )
    FROM children c
    CROSS JOIN events_by_date
  );
END $$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_month_view(UUID, INTEGER, INTEGER, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_month_view(UUID, INTEGER, INTEGER, UUID[]) TO anon;
GRANT EXECUTE ON FUNCTION get_month_view(UUID, INTEGER, INTEGER, UUID[]) TO service_role;

