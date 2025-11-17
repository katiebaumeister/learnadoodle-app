-- Align all views to use family timezone consistently
-- Updates get_week_view and get_month_view to use family timezone

-- Ensure helper function exists
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

-- =====================================================
-- UPDATE get_week_view to use family timezone
-- =====================================================
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
  v_tz TEXT;
BEGIN
  -- Get family timezone
  v_tz := get_family_timezone(_family_id);
  
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
          AND (
            _child_ids IS NULL 
            OR array_length(_child_ids, 1) IS NULL
            OR array_length(_child_ids, 1) = 0
            OR c.id = ANY(_child_ids::uuid[])
          )
  );

  -- Availability windows per day
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
        SELECT 
          c.id AS child_id, 
          d.date,
          COALESCE(cdc.day_status, 'teach') AS day_status,
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
          AND (
            _child_ids IS NULL 
            OR array_length(_child_ids, 1) IS NULL
            OR array_length(_child_ids, 1) = 0
            OR c.id = ANY(_child_ids::uuid[])
          )
      ) a
      ORDER BY a.child_id, a.date
    ) q
  );

  -- Events in the window - convert to family timezone
  v_events := (
    SELECT COALESCE(JSONB_AGG(x ORDER BY start_local_ts), '[]'::jsonb)
    FROM (
      SELECT JSONB_BUILD_OBJECT(
        'id', e.id,
        'child_id', e.child_id,
        'title', e.title,
        'subject_id', e.subject_id,
        'status', e.status,
        'start_ts', e.start_ts,  -- Keep original for compatibility
        'end_ts', e.end_ts,      -- Keep original for compatibility
        'start_local', TO_CHAR((e.start_ts AT TIME ZONE v_tz), 'HH24:MI'),  -- Local time string in family timezone
        'end_local', TO_CHAR((e.end_ts AT TIME ZONE v_tz), 'HH24:MI'),      -- Local time string in family timezone
        'start_local_ts', (e.start_ts AT TIME ZONE v_tz),  -- For sorting (timestamp without timezone)
        'date_local', TO_CHAR((e.start_ts AT TIME ZONE v_tz)::date, 'YYYY-MM-DD')  -- Local date for grouping (as string)
      ) AS x,
      (e.start_ts AT TIME ZONE v_tz) AS start_local_ts
      FROM events e
      WHERE e.family_id = _family_id
        AND e.status IN ('scheduled', 'done', 'in_progress')
        -- Filter by local date boundaries (convert timestamptz to family timezone, then compare dates)
        AND (e.start_ts AT TIME ZONE v_tz)::date >= _from
        AND (e.start_ts AT TIME ZONE v_tz)::date < _to
        AND (
          _child_ids IS NULL 
          OR array_length(_child_ids, 1) IS NULL
          OR array_length(_child_ids, 1) = 0
          OR e.child_id = ANY(_child_ids::uuid[])
          OR (e.child_id IS NULL AND _child_ids IS NULL)
        )
    ) q
  );

  RETURN JSONB_BUILD_OBJECT(
    'children', v_children,
    'avail', v_avail,
    'events', v_events,
    'timezone', v_tz
  );
END $$;

-- =====================================================
-- UPDATE get_month_view to use family timezone (if it exists)
-- =====================================================
-- Check if get_month_view exists and update it
DO $$
BEGIN
  -- Only create if it doesn't exist or update if it does
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'get_month_view' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    -- Update existing function
    EXECUTE format('
      CREATE OR REPLACE FUNCTION get_month_view(
        _family_id uuid,
        _year int,
        _month int,
        _child_ids uuid[] DEFAULT NULL
      )
      RETURNS jsonb
      LANGUAGE sql
      STABLE
      AS $func$
      WITH fam AS (
        SELECT get_family_timezone(_family_id) AS tz
      ),
      bounds AS (
        SELECT
          make_date(_year, _month, 1)::date AS month_start_local,
          (make_date(_year, _month, 1)
           + INTERVAL ''1 month''
           - INTERVAL ''1 day'')::date AS month_end_local
      ),
      events_local AS (
        SELECT
          e.id,
          e.family_id,
          e.child_id,
          e.subject_id,
          e.title,
          e.description,
          e.status,
          e.source,
          e.start_ts,
          e.end_ts,
          -- Convert to family-local wall time
          (e.start_ts AT TIME ZONE (SELECT tz FROM fam)) AS start_local_ts,
          (e.end_ts   AT TIME ZONE (SELECT tz FROM fam)) AS end_local_ts
        FROM events e
        WHERE e.family_id = _family_id
          AND e.status IN (''scheduled'',''in_progress'',''done'')
          AND (
            ((e.start_ts AT TIME ZONE (SELECT tz FROM fam))::date BETWEEN
               (SELECT month_start_local FROM bounds) AND (SELECT month_end_local FROM bounds))
            OR
            (
              (e.start_ts AT TIME ZONE (SELECT tz FROM fam))::date <= (SELECT month_end_local FROM bounds)
              AND (e.end_ts   AT TIME ZONE (SELECT tz FROM fam))::date >= (SELECT month_start_local FROM bounds)
            )
          )
          AND (
            _child_ids IS NULL
            OR e.child_id = ANY(_child_ids)
            OR (e.child_id IS NULL AND _child_ids IS NULL)
          )
      ),
      events_by_date AS (
        SELECT
          (start_local_ts::date)::text AS date_key,
          jsonb_agg(
            jsonb_build_object(
              ''id'', id,
              ''title'', title,
              ''child_id'', child_id,
              ''subject_id'', subject_id,
              ''status'', status,
              ''source'', source,
              ''start_local'', to_char(start_local_ts, ''HH24:MI''),
              ''end_local'',   to_char(end_local_ts,   ''HH24:MI''),
              ''start_ts'', start_ts,  -- Keep for compatibility
              ''end_ts'', end_ts      -- Keep for compatibility
            )
            ORDER BY start_local_ts NULLS LAST
          ) AS events
        FROM events_local
        GROUP BY start_local_ts::date
      ),
      events_object AS (
        SELECT COALESCE(jsonb_object_agg(date_key, events ORDER BY date_key), ''{}''::jsonb) AS events_by_date
        FROM events_by_date
      ),
      children AS (
        SELECT id, COALESCE(first_name, ''Child'') AS name, grade, avatar
        FROM children
        WHERE family_id = _family_id
        ORDER BY COALESCE(first_name, ''Child'')
      )
      SELECT jsonb_build_object(
        ''timezone'', (SELECT tz FROM fam),
        ''year'', _year,
        ''month'', _month,
        ''events_by_date'', (SELECT events_by_date FROM events_object),
        ''children'', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM children c), ''[]''::jsonb)
      );
      $func$;
    ');
    RAISE NOTICE 'Updated get_month_view to use family timezone';
  ELSE
    RAISE NOTICE 'get_month_view does not exist, skipping update';
  END IF;
END $$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_family_timezone(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_family_timezone(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_week_view(UUID, DATE, DATE, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_week_view(UUID, DATE, DATE, UUID[]) TO anon;

