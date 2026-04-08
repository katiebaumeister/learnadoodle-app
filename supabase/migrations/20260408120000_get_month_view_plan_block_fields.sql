-- Include generated_by + source_block_id in get_month_view so planner can treat
-- plan-year block slots as a deletable group (same as recurrence series UX).

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
  SELECT COALESCE(get_family_timezone(_family_id), 'America/New_York') AS timezone
),
bounds AS (
  SELECT
    DATE(_year || '-' || LPAD(_month::text, 2, '0') || '-01') AS month_start,
    (DATE(_year || '-' || LPAD(_month::text, 2, '0') || '-01') + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end
),
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
events AS (
  SELECT
    e.id,
    e.child_id,
    e.child_ids,
    e.title,
    e.description,
    e.subject_id,
    s.name as subject_name,
    e.status,
    e.start_ts,
    e.end_ts,
    e.year_plan_id,
    e.event_type,
    e.counts_toward_plan,
    e.instructional_status,
    e.academic_year_id,
    e.recurrence_rule,
    e.parent_event_id,
    e.recurrence_id,
    e.generated_by,
    e.source_block_id,
    EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60 AS duration_minutes,
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS start_local,
    TO_CHAR((e.end_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS end_local,
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'YYYY-MM-DD') AS date_local,
    e.source,
    e.family_id
  FROM events e
  LEFT JOIN subject s ON s.id = e.subject_id
  WHERE e.family_id = _family_id
    AND (e.start_ts AT TIME ZONE (SELECT timezone FROM fam))::date >= (SELECT month_start FROM bounds)
    AND (e.start_ts AT TIME ZONE (SELECT timezone FROM fam))::date <= (SELECT month_end FROM bounds)
    AND (
      _child_ids IS NULL
      OR e.child_id = ANY(_child_ids)
      OR (e.child_id IS NULL AND e.child_ids IS NOT NULL AND e.child_ids && _child_ids)
    )
    AND (e.status IS NULL OR e.status != 'canceled')
    AND (e.canceled_at IS NULL)
    AND (e.deleted_at IS NULL)
  ORDER BY e.start_ts
),
events_by_date AS (
  SELECT
    date_local,
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', id,
        'child_id', child_id,
        'child_ids', child_ids,
        'title', title,
        'description', description,
        'subject_id', subject_id,
        'subject_name', subject_name,
        'status', status,
        'start_ts', start_ts,
        'end_ts', end_ts,
        'year_plan_id', year_plan_id,
        'event_type', event_type,
        'counts_toward_plan', counts_toward_plan,
        'instructional_status', instructional_status,
        'academic_year_id', academic_year_id,
        'recurrence_rule', recurrence_rule,
        'parent_event_id', parent_event_id,
        'recurrence_id', recurrence_id,
        'generated_by', generated_by,
        'source_block_id', source_block_id,
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

COMMENT ON FUNCTION get_month_view(UUID, INTEGER, INTEGER, UUID[]) IS 'Month calendar view. Includes recurrence + plan block fields for series delete UX.';
