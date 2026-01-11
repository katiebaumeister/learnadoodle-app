-- Fix get_week_view to exclude canceled events
-- Canceled events should not appear in the planner views

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
-- Get events for the week (EXCLUDE CANCELED EVENTS)
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
    AND (e.status IS NULL OR e.status != 'canceled')  -- EXCLUDE CANCELED EVENTS
    AND (e.canceled_at IS NULL)  -- Also exclude events with canceled_at timestamp
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
    'start_local', e.start_local,
    'end_local', e.end_local,
    'date_local', e.date_local,
    'source', e.source,
    'pattern_day', e.pattern_day
  ) ORDER BY e.start_ts) FROM events e), '[]'::jsonb)
);
$$;

COMMENT ON FUNCTION get_week_view IS 'Returns week view data including children, availability, and events. Excludes canceled events.';

-- Also fix get_month_view to exclude canceled events
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
-- Get events for the entire month (EXCLUDE CANCELED EVENTS)
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
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS start_local,
    TO_CHAR((e.end_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS end_local,
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'YYYY-MM-DD') AS date_local,
    e.source,
    e.family_id
  FROM events e
  LEFT JOIN subject s ON s.id = e.subject_id
  WHERE e.family_id = _family_id
    AND e.start_ts >= ((SELECT month_start FROM bounds)::timestamptz)
    AND e.start_ts < ((SELECT month_end FROM bounds)::timestamptz + INTERVAL '1 day')
    AND (_child_ids IS NULL OR e.child_id = ANY(_child_ids))
    AND (e.status IS NULL OR e.status != 'canceled')  -- EXCLUDE CANCELED EVENTS
    AND (e.canceled_at IS NULL)  -- Also exclude events with canceled_at timestamp
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
        'year_plan_id', year_plan_id,
        'duration_minutes', duration_minutes,
        'start_local', start_local,
        'end_local', end_local,
        'source', source
      ) ORDER BY start_ts
    ) as events
  FROM events
  GROUP BY date_local
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
  'events_by_date', (
    SELECT COALESCE(JSONB_OBJECT_AGG(date_local, events), '{}'::jsonb)
    FROM events_by_date
  ),
  'month_start', (SELECT month_start FROM bounds),
  'month_end', (SELECT month_end FROM bounds),
  'year', _year,
  'month', _month,
  'timezone', (SELECT timezone FROM fam)
);
$$;

COMMENT ON FUNCTION get_month_view IS 'Returns month view data including children and events. Excludes canceled events.';
