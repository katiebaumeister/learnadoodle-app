-- Add year_plan_id to get_week_view RPC
-- This ensures events seeded from year plans include their year_plan_id
-- so the Rebalance option appears in the context menu for Week view

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

  -- Events in the window (ADDED year_plan_id)
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
        'year_plan_id', e.year_plan_id  -- ADDED: Include year_plan_id
      ) AS x, e.start_ts
      FROM events e
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

