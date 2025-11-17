-- =====================================================
-- FIX TIMEZONE CONVERSION IN get_week_view RPC
-- The issue: Week view shows wrong times (5 AM instead of 9 AM)
-- Need to match the corrected timezone logic from get_month_view
-- =====================================================

-- Drop and recreate get_week_view with correct timezone handling
DROP FUNCTION IF EXISTS get_week_view(UUID, DATE, DATE, UUID[]);

CREATE OR REPLACE FUNCTION get_week_view(
  _family_id UUID,
  _from DATE,
  _to DATE,
  _child_ids UUID[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_children JSONB;
  v_avail JSONB;
  v_events JSONB;
BEGIN
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

  -- Events in the window with CORRECTED timezone conversion
  v_events := (
    SELECT COALESCE(JSONB_AGG(x ORDER BY start_ts), '[]'::jsonb)
    FROM (
      SELECT JSONB_BUILD_OBJECT(
        'id', e.id,
        'child_id', e.child_id,
        'title', e.title,
        'subject', e.subject_id,
        'status', e.status,
        'start_ts', e.start_ts,
        'end_ts', e.end_ts,
        -- FIXED: Use proper timezone conversion (same as get_month_view)
        'start_local', TO_CHAR((e.start_ts AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York'), 'HH24:MI'),
        'end_local', TO_CHAR((e.end_ts AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York'), 'HH24:MI'),
        'date_local', TO_CHAR((e.start_ts AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York'), 'YYYY-MM-DD'),
        'subject_name', s.name,
        'duration_minutes', EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60,
        'description', e.description,
        'source', e.source
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
    'events', v_events,
    'from', _from,
    'to', _to
  );
END $$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_week_view(UUID, DATE, DATE, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_week_view(UUID, DATE, DATE, UUID[]) TO anon;

-- Test the fixed function
DO $$
DECLARE
  test_result JSONB;
BEGIN
  SELECT get_week_view(
    '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'::uuid,
    '2025-10-21'::date,
    '2025-10-25'::date,
    NULL
  ) INTO test_result;
  
  RAISE NOTICE 'Fixed get_week_view test:';
  RAISE NOTICE 'Sample event: % at %', 
    test_result->'events'->0->>'title',
    test_result->'events'->0->>'start_local';
END $$;
