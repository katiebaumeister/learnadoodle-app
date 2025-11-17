-- Fix get_week_view RPC to include date_local, start_local, end_local
-- This ensures events are matched to the correct day in the family's timezone

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

  RETURN COALESCE(v_tz, 'UTC');
END;
$$;

DROP FUNCTION IF EXISTS get_week_view(UUID, DATE, DATE, UUID[]);

CREATE OR REPLACE FUNCTION get_week_view(
  _family_id UUID,
  _from DATE,
  _to DATE,
  _child_ids UUID[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_children JSONB;
  v_avail JSONB;
  v_events JSONB;
  v_timezone TEXT;
BEGIN
  -- Get family timezone using helper function (handles missing column gracefully)
  SELECT get_family_timezone(_family_id) INTO v_timezone;
  
  -- Default to America/New_York if not set (or if explicitly UTC, which usually means "not set")
  IF v_timezone IS NULL OR v_timezone = 'UTC' OR v_timezone = '' THEN
    v_timezone := 'America/New_York';
  END IF;

  -- Children list
  v_children := (
    SELECT COALESCE(
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', c.id,
          'name', COALESCE(c.first_name, 'Child')
        ) ORDER BY COALESCE(c.first_name, 'Child')
      ),
      '[]'::jsonb
    )
    FROM children c
    WHERE c.family_id = _family_id
      AND (_child_ids IS NULL OR c.id = ANY(_child_ids))
  );

  -- Availability windows per day using helper
  v_avail := (
    SELECT COALESCE(JSONB_AGG(x), '[]'::jsonb)
    FROM (
      SELECT JSONB_BUILD_OBJECT(
        'child_id', a.child_id,
        'date', a.date,
        'day_status', a.day_status,
        'windows', a.windows
      ) AS x
      FROM (
        SELECT c.id AS child_id, ga.date, ga.day_status, ga.windows
        FROM children c
        JOIN LATERAL get_child_availability_windows(c.id, _from, _to) ga ON true
        WHERE c.family_id = _family_id
          AND (_child_ids IS NULL OR c.id = ANY(_child_ids))
      ) a
      ORDER BY a.child_id, a.date
    ) q
  );

  -- Events in the window with timezone-aware date_local
  v_events := (
    SELECT COALESCE(JSONB_AGG(x ORDER BY start_ts), '[]'::jsonb)
    FROM (
      SELECT JSONB_BUILD_OBJECT(
        'id', e.id,
        'child_id', e.child_id,
        'title', e.title,
        'subject', e.subject_id,
        'subject_name', s.name,
        'status', e.status,
        'start_ts', e.start_ts,
        'end_ts', e.end_ts,
        -- CRITICAL: Add timezone-aware local date/time fields
        -- Convert timestamptz directly to target timezone
        -- start_ts is already in UTC (timestamptz), so we convert it to the family timezone
        'start_local', TO_CHAR((e.start_ts AT TIME ZONE v_timezone), 'HH24:MI'),
        'end_local', TO_CHAR((e.end_ts AT TIME ZONE v_timezone), 'HH24:MI'),
        'date_local', TO_CHAR((e.start_ts AT TIME ZONE v_timezone), 'YYYY-MM-DD')
      ) AS x, e.start_ts
      FROM events e
      LEFT JOIN subject s ON s.id = e.subject_id
      WHERE e.family_id = _family_id
        AND e.start_ts >= _from::timestamptz
        AND e.start_ts < _to::timestamptz
        AND (_child_ids IS NULL OR e.child_id = ANY(_child_ids))
    ) q
  );

  RETURN JSONB_BUILD_OBJECT(
    'children', v_children,
    'avail', v_avail,
    'events', v_events
  );
END $$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_week_view(UUID, DATE, DATE, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_week_view(UUID, DATE, DATE, UUID[]) TO anon;
GRANT EXECUTE ON FUNCTION get_week_view(UUID, DATE, DATE, UUID[]) TO service_role;

