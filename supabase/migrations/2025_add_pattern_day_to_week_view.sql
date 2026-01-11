-- Update get_week_view to include pattern_day from calendar_days_cache
-- This enables A/B day display in PlannerWeek

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
    cdc.pattern_day, -- ADDED: Include pattern_day from cache
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
    e.year_plan_id,
    e.recurrence_rule,  -- ADDED: Include recurrence_rule for recurring events
    e.parent_event_id,  -- ADDED: Include parent_event_id for recurring instances
    e.recurrence_id,  -- ADDED: Include recurrence_id for recurring series
    EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60 AS duration_minutes,
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS start_local,
    TO_CHAR((e.end_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS end_local,
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'YYYY-MM-DD') AS date_local,
    e.source,
    e.family_id,
    e.pattern_day -- ADDED: Include pattern_day from events table
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
    'pattern_day', a.pattern_day, -- ADDED: Include pattern_day in response
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
    'family_id', e.family_id,
    'pattern_day', e.pattern_day, -- ADDED: Include pattern_day in events
    'recurrence_rule', e.recurrence_rule, -- ADDED: Include recurrence_rule for recurring events
    'parent_event_id', e.parent_event_id, -- ADDED: Include parent_event_id for recurring instances
    'recurrence_id', e.recurrence_id -- ADDED: Include recurrence_id for recurring series
  )) FROM events e), '[]'::jsonb)
);
$$;

