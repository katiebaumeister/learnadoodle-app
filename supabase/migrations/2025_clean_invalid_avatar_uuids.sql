-- ============================================================
-- Clean up invalid UUID avatar URLs in children table
-- This migration removes UUIDs that are stored as avatar URLs
-- and replaces them with NULL, preventing 404 errors
-- ============================================================

-- Function to check if a string is just a UUID (not a valid URL)
CREATE OR REPLACE FUNCTION is_invalid_avatar_uuid(url_text TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT 
    url_text IS NOT NULL 
    AND url_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND NOT (url_text LIKE 'http://%' OR url_text LIKE 'https://%' OR url_text LIKE 'data:%')
$$;

-- Clean up avatar_url column
UPDATE children
SET avatar_url = NULL
WHERE is_invalid_avatar_uuid(avatar_url);

-- Clean up avatar column
UPDATE children
SET avatar = NULL
WHERE is_invalid_avatar_uuid(avatar);

-- Also clean up profiles table
UPDATE profiles
SET avatar_url = NULL
WHERE is_invalid_avatar_uuid(avatar_url);

-- Clean up uploads table url field (may contain UUIDs instead of valid URLs)
UPDATE uploads
SET url = NULL
WHERE is_invalid_avatar_uuid(url);

-- Update get_month_view RPC to filter out invalid UUIDs
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
-- Filter out invalid UUID avatars
children AS (
  SELECT 
    id, 
    COALESCE(first_name, 'Child') as name,
    COALESCE(grade_level::text, grade::text) as grade, 
    CASE 
      WHEN is_invalid_avatar_uuid(avatar) THEN NULL
      ELSE avatar
    END as avatar,
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
    e.year_plan_id,
    e.event_type,
    e.recurrence_rule,
    e.parent_event_id,
    e.recurrence_id,
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
        'source', source,
        'event_type', event_type,
        'recurrence_rule', recurrence_rule,
        'parent_event_id', parent_event_id,
        'recurrence_id', recurrence_id
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

-- Update get_week_view RPC to filter out invalid UUIDs
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
-- Filter out invalid UUID avatars
children AS (
  SELECT 
    id, 
    COALESCE(first_name, 'Child') as name,
    COALESCE(grade_level::text, grade::text) as grade, 
    CASE 
      WHEN is_invalid_avatar_uuid(avatar) THEN NULL
      ELSE avatar
    END as avatar,
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
    EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60 AS duration_minutes,
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS start_local,
    TO_CHAR((e.end_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS end_local,
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'YYYY-MM-DD') AS date_local,
    e.source,
    e.family_id,
    cdc.pattern_day,
    e.recurrence_rule,
    e.parent_event_id,
    e.recurrence_id
  FROM events e
  LEFT JOIN subject s ON s.id = e.subject_id
  LEFT JOIN calendar_days_cache cdc ON cdc.date = (e.start_ts AT TIME ZONE (SELECT timezone FROM fam))::date 
    AND cdc.child_id = e.child_id 
    AND cdc.family_id = e.family_id
  WHERE e.family_id = _family_id
    AND e.start_ts >= (_from::timestamptz)
    AND e.start_ts < (_to::timestamptz + INTERVAL '1 day')
    AND (_child_ids IS NULL OR e.child_id = ANY(_child_ids))
    AND e.deleted_at IS NULL  -- Exclude soft-deleted events
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
    'family_id', e.family_id,
    'pattern_day', e.pattern_day,
    'recurrence_rule', e.recurrence_rule,
    'parent_event_id', e.parent_event_id,
    'recurrence_id', e.recurrence_id
  )) FROM events e), '[]'::jsonb)
);
$$;

-- Update get_home_data RPC to filter out invalid UUIDs
CREATE OR REPLACE FUNCTION get_home_data(
  _family_id UUID,
  _date DATE DEFAULT CURRENT_DATE,
  _horizon_days INT DEFAULT 14
) RETURNS JSONB
LANGUAGE SQL
STABLE
AS $$
WITH fam AS (
  SELECT 'America/New_York' as timezone 
),
bounds AS (
  SELECT
    _date::date AS d0,
    (_date + 1)::date AS d1,
    (_date + _horizon_days)::date AS dH
),
-- Get children - filter out invalid UUID avatars
kids AS (
  SELECT 
    id, 
    COALESCE(first_name, 'Child') as name,
    COALESCE(grade_level::text, grade::text) as grade, 
    CASE 
      WHEN is_invalid_avatar_uuid(avatar) THEN NULL
      ELSE avatar
    END as avatar
  FROM children
  WHERE family_id = _family_id
  ORDER BY COALESCE(first_name, 'Child')
),
today_events AS (
  SELECT
    e.id, 
    e.child_id, 
    e.title,
    e.subject_id, 
    s.name AS subject,
    e.status,
    e.start_ts, 
    e.end_ts,
    e.description,
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS start_local,
    TO_CHAR((e.end_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS end_local,
    EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60 AS duration_minutes
  FROM events e
  LEFT JOIN subject s ON s.id = e.subject_id,
  bounds b
  WHERE e.family_id = _family_id
    AND e.status IN ('scheduled', 'done', 'in_progress')
    AND (e.start_ts AT TIME ZONE (SELECT timezone FROM fam))::date = (b.d0)
    AND e.deleted_at IS NULL  -- Exclude soft-deleted events
  ORDER BY e.start_ts
),
tasks_today AS (
  SELECT 
    e.id, 
    e.title, 
    e.child_id, 
    e.status, 
    e.start_ts,
    e.description,
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS due_time
  FROM events e, bounds b
  WHERE e.family_id = _family_id
    AND e.status = 'scheduled'
    AND (e.start_ts AT TIME ZONE (SELECT timezone FROM fam))::date = (b.d0)
    AND EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60 < 30
    AND e.deleted_at IS NULL  -- Exclude soft-deleted events
  ORDER BY e.start_ts
),
big_events AS (
  SELECT
    e.id,
    e.title,
    e.child_id,
    e.start_ts,
    e.end_ts,
    e.location as "where",
    (e.start_ts AT TIME ZONE (SELECT timezone FROM fam))::date as "when",
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'Mon DD, YYYY at HH24:MI') as when_formatted
  FROM events e, bounds b
  WHERE e.family_id = _family_id
    AND e.status IN ('scheduled', 'done', 'in_progress')
    AND (e.start_ts AT TIME ZONE (SELECT timezone FROM fam))::date >= (b.d0)
    AND (e.start_ts AT TIME ZONE (SELECT timezone FROM fam))::date <= (b.dH)
    AND EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60 >= 90
    AND e.deleted_at IS NULL  -- Exclude soft-deleted events
  ORDER BY e.start_ts
  LIMIT 10
),
day_cache AS (
  SELECT DISTINCT
    c.id as child_id,
    c.name as child_name,
    b.d0 as date,
    COALESCE(
      (SELECT day_status FROM calendar_days_cache 
       WHERE child_id = c.id AND date = b.d0 AND family_id = _family_id LIMIT 1),
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM schedule_overrides o
          WHERE o.date = b.d0
            AND o.is_active = true
            AND o.override_kind = 'day_off'
            AND (
              (o.scope_type = 'family' AND o.scope_id = _family_id)
              OR (o.scope_type = 'child' AND o.scope_id = c.id)
            )
        ) THEN 'off'
        ELSE 'teach'
      END
    ) as day_status,
    (SELECT first_block_start FROM calendar_days_cache 
     WHERE child_id = c.id AND date = b.d0 AND family_id = _family_id LIMIT 1) as first_block_start,
    (SELECT last_block_end FROM calendar_days_cache 
     WHERE child_id = c.id AND date = b.d0 AND family_id = _family_id LIMIT 1) as last_block_end
  FROM kids c, bounds b
),
scheduled_minutes AS (
  SELECT 
    child_id,
    SUM(EXTRACT(EPOCH FROM (end_ts - start_ts)) / 60)::INT as scheduled_min
  FROM events e, bounds b
  WHERE e.family_id = _family_id
    AND e.status IN ('scheduled', 'done', 'in_progress')
    AND (e.start_ts AT TIME ZONE (SELECT timezone FROM fam))::date = (b.d0)
  GROUP BY child_id
),
available_minutes AS (
  SELECT 
    child_id,
    SUM(EXTRACT(EPOCH FROM (last_block_end - first_block_start)) / 60)::INT as available_min
  FROM day_cache
  WHERE first_block_start IS NOT NULL AND last_block_end IS NOT NULL
  GROUP BY child_id
),
next_event AS (
  SELECT
    e.id,
    e.title,
    e.child_id,
    e.start_ts,
    e.location,
    (e.start_ts AT TIME ZONE (SELECT timezone FROM fam))::date as date,
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') as time
  FROM events e, bounds b
  WHERE e.family_id = _family_id
    AND e.status = 'scheduled'
    AND (e.start_ts AT TIME ZONE (SELECT timezone FROM fam))::date >= (b.d0)
  ORDER BY e.start_ts
  LIMIT 1
),
stories AS (
  SELECT jsonb_build_array(
    jsonb_build_object('type', 'tip', 'title', 'Welcome!', 'content', 'Get started by adding your first lesson.')
  ) as items
)
SELECT JSONB_BUILD_OBJECT(
  'children', (
    SELECT COALESCE(JSONB_AGG(TO_JSONB(k)), '[]'::jsonb) 
    FROM kids k
  ),
  'learning', (
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', te.id,
        'child_id', te.child_id,
        'subject', COALESCE(te.subject, te.title),
        'topic', COALESCE(NULLIF(te.title, ''), te.subject),
        'start', te.start_local,
        'end', te.end_local,
        'status', te.status,
        'duration_minutes', te.duration_minutes
      ) ORDER BY te.start_ts
    ), '[]'::jsonb) 
    FROM today_events te
  ),
  'tasks', (
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', t.id,
        'title', t.title,
        'child_id', t.child_id,
        'status', t.status,
        'due_time', t.due_time,
        'description', t.description
      ) ORDER BY t.start_ts
    ), '[]'::jsonb) 
    FROM tasks_today t
  ),
  'events', (
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', be.id,
        'title', be.title,
        'where', be."where",
        'when', be."when",
        'when_formatted', be.when_formatted,
        'child_id', be.child_id
      ) ORDER BY be."when"
    ), '[]'::jsonb) 
    FROM big_events be
  ),
  'availability', (
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'child_id', dc.child_id,
        'child_name', dc.child_name,
        'day_status', dc.day_status,
        'first_block_start', dc.first_block_start,
        'last_block_end', dc.last_block_end,
        'scheduled_min', COALESCE(sm.scheduled_min, 0),
        'available_min', COALESCE(am.available_min, 0)
      )
    ), '[]'::jsonb) 
    FROM day_cache dc
    LEFT JOIN scheduled_minutes sm ON sm.child_id = dc.child_id
    LEFT JOIN available_minutes am ON am.child_id = dc.child_id
  ),
  'stories', (
    SELECT COALESCE(items, '[]'::jsonb) 
    FROM stories
  ),
  'next_event', (
    SELECT COALESCE(TO_JSONB(ne), 'null'::jsonb)
    FROM next_event ne
  ),
  'date', _date,
  'timezone', (SELECT timezone FROM fam)
);
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_month_view(UUID, INTEGER, INTEGER, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_month_view(UUID, INTEGER, INTEGER, UUID[]) TO anon;
GRANT EXECUTE ON FUNCTION get_week_view(UUID, DATE, DATE, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_week_view(UUID, DATE, DATE, UUID[]) TO anon;
GRANT EXECUTE ON FUNCTION get_home_data(UUID, DATE, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_home_data(UUID, DATE, INT) TO anon;

-- Add comment
COMMENT ON FUNCTION is_invalid_avatar_uuid IS 'Checks if a string is just a UUID (not a valid URL). Returns true if the string matches UUID pattern and is not a valid http/https/data URL.';

-- Verification: Check if any invalid UUIDs remain (should return 0 rows)
-- Run this query after migration to verify cleanup:
-- SELECT 'children.avatar' as column_name, COUNT(*) as invalid_count 
-- FROM children WHERE is_invalid_avatar_uuid(avatar)
-- UNION ALL
-- SELECT 'children.avatar_url', COUNT(*) 
-- FROM children WHERE is_invalid_avatar_uuid(avatar_url)
-- UNION ALL
-- SELECT 'profiles.avatar_url', COUNT(*) 
-- FROM profiles WHERE is_invalid_avatar_uuid(avatar_url)
-- UNION ALL
-- SELECT 'uploads.url', COUNT(*) 
-- FROM uploads WHERE is_invalid_avatar_uuid(url);

