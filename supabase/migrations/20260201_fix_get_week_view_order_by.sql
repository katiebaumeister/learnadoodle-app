-- Fix get_week_view RPC: Move ORDER BY inside JSONB_AGG to fix SQL grouping error
-- Error: "column \"a.date\" must appear in the GROUP BY clause or be used in an aggregate function"

CREATE OR REPLACE FUNCTION public.get_week_view(
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
  v_timezone TEXT := 'America/New_York';
BEGIN
  -- Use canonical family membership check
  IF NOT public.is_family_member(_family_id) THEN
    RAISE EXCEPTION 'Not authorized for family %', _family_id;
  END IF;

  -- Get family timezone if available
  BEGIN
    SELECT timezone INTO v_timezone
    FROM family
    WHERE id = _family_id;
  EXCEPTION WHEN OTHERS THEN
    -- Column might not exist, use default
    v_timezone := 'America/New_York';
  END;

  IF v_timezone IS NULL OR v_timezone = 'UTC' OR v_timezone = '' THEN
    v_timezone := 'America/New_York';
  END IF;

  -- Children list
  v_children := (
    SELECT COALESCE(
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', c.id,
          'name', COALESCE(c.first_name, 'Child'),
          'grade', COALESCE(c.grade_level::text, c.grade::text),
          'avatar', c.avatar
        ) ORDER BY COALESCE(c.first_name, 'Child')
      ),
      '[]'::jsonb
    )
    FROM children c
    WHERE c.family_id = _family_id
      AND c.archived = false
      AND (_child_ids IS NULL OR c.id = ANY(_child_ids))
  );

  -- Availability windows per day
  -- FIX: Use subquery with ORDER BY, then aggregate (avoids grouping error)
  v_avail := (
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'child_id', a.child_id,
        'date', a.date,
        'day_status', a.day_status,
        'pattern_day', a.pattern_day,
        'windows', a.windows
      )
    ), '[]'::jsonb)
    FROM (
      SELECT 
        c.id AS child_id,
        d.date::date AS date,
        COALESCE(cdc.day_status, 'teach') AS day_status,
        cdc.pattern_day,
        CASE 
          WHEN COALESCE(cdc.day_status, 'teach') = 'off' THEN '[]'::jsonb
          WHEN cdc.first_block_start IS NULL OR cdc.last_block_end IS NULL THEN '[]'::jsonb
          ELSE jsonb_build_array(
            jsonb_build_object(
              'start', cdc.first_block_start,
              'end', cdc.last_block_end,
              'status', COALESCE(cdc.day_status, 'teach')
            )
          )
        END AS windows
      FROM children c
      CROSS JOIN generate_series(_from, _to, interval '1 day') AS d(date)
      LEFT JOIN calendar_days_cache cdc ON cdc.child_id = c.id 
        AND cdc.date = d.date::date 
        AND cdc.family_id = _family_id
      WHERE c.family_id = _family_id
        AND c.archived = false
        AND (_child_ids IS NULL OR c.id = ANY(_child_ids))
      ORDER BY d.date::date, c.id
    ) a
  );

  -- Events in the window with proper filters and timezone-aware fields
  v_events := (
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', e.id,
        'child_id', e.child_id,
        'child_ids', e.child_ids, -- Support multi-child events
        'title', e.title,
        'description', e.description,
        'subject_id', e.subject_id,
        'subject_name', s.name,
        'status', e.status,
        'start_ts', e.start_ts,
        'end_ts', e.end_ts,
        'start_local', TO_CHAR((e.start_ts AT TIME ZONE v_timezone), 'HH24:MI'),
        'end_local', TO_CHAR((e.end_ts AT TIME ZONE v_timezone), 'HH24:MI'),
        'date_local', TO_CHAR((e.start_ts AT TIME ZONE v_timezone), 'YYYY-MM-DD'),
        'event_type', e.event_type,
        'pattern_day', e.pattern_day,
        'recurrence_rule', e.recurrence_rule,
        'parent_event_id', e.parent_event_id,
        'recurrence_id', e.recurrence_id,
        'year_plan_id', e.year_plan_id,
        'source', e.source
      ) ORDER BY e.start_ts
    ), '[]'::jsonb)
    FROM events e
    LEFT JOIN subject s ON s.id = e.subject_id
    WHERE e.family_id = _family_id
      AND e.deleted_at IS NULL
      AND e.canceled_at IS NULL
      AND e.is_backlog = false
      AND e.start_ts >= (_from::date AT TIME ZONE v_timezone)::timestamptz
      AND e.start_ts < ((_to::date + INTERVAL '1 day') AT TIME ZONE v_timezone)::timestamptz
      AND (
        _child_ids IS NULL 
        OR e.child_id = ANY(_child_ids)
        OR (e.child_ids IS NOT NULL AND e.child_ids && _child_ids)
      )
  );

  RETURN JSONB_BUILD_OBJECT(
    'children', v_children,
    'avail', v_avail,
    'events', v_events
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_week_view(UUID, DATE, DATE, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_week_view(UUID, DATE, DATE, UUID[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_week_view(UUID, DATE, DATE, UUID[]) TO service_role;
