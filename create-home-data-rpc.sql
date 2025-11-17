-- One-shot RPC for Home screen data
-- Returns all data needed for the Home screen in a single JSON payload

CREATE OR REPLACE FUNCTION get_home_data(
  _family_id UUID,
  _date DATE DEFAULT CURRENT_DATE,
  _horizon_days INT DEFAULT 14
) RETURNS JSONB
LANGUAGE SQL
STABLE
AS $$
WITH fam AS (
  SELECT get_family_timezone(_family_id) AS timezone
),
bounds AS (
  SELECT
    _date::date AS d0,
    (_date + 1)::date AS d1,
    (_date + _horizon_days)::date AS dH
),
kids AS (
  SELECT 
    id, 
    COALESCE(first_name, 'Child') as name,
    grade, 
    avatar
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
    -- Use family-local boundaries
    AND (e.start_ts AT TIME ZONE (SELECT timezone FROM fam))::date = (b.d0)
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
    -- Same family-local boundaries
    AND (e.start_ts AT TIME ZONE (SELECT timezone FROM fam))::date = (b.d0)
    -- Mark as task if duration < 30 min
    AND EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60 < 30
  ORDER BY e.start_ts
),
big_events AS (
  SELECT 
    e.id, 
    e.title, 
    e.description AS "where", 
    e.start_ts AS "when",
    e.child_id,
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'Mon, MMM DD at HH24:MI') AS when_formatted
  FROM events e, bounds b
  WHERE e.family_id = _family_id
    AND e.status = 'scheduled'
    AND e.start_ts >= (b.d1::timestamptz)
    AND e.start_ts < (b.dH::timestamptz)
    -- Mark as big event if duration >= 90 min
    AND EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) >= 90 * 60
  ORDER BY e.start_ts
  LIMIT 5
),
day_cache AS (
  SELECT 
    COALESCE(c.first_name, 'Child') AS child_name,
    dc.child_id, 
    dc.day_status, 
    dc.first_block_start, 
    dc.last_block_end
  FROM calendar_days_cache dc
  JOIN children c ON c.id = dc.child_id
  WHERE dc.family_id = _family_id 
    AND dc.date = _date
),
scheduled_minutes AS (
  SELECT 
    child_id, 
    SUM(EXTRACT(EPOCH FROM (end_ts - start_ts)) / 60) AS scheduled_min
  FROM events
  WHERE family_id = _family_id
    AND (start_ts AT TIME ZONE (SELECT timezone FROM fam))::date = _date
    AND status IN ('scheduled', 'done')
  GROUP BY child_id
),
available_minutes AS (
  SELECT 
    dc.child_id,
    SUM(
      EXTRACT(EPOCH FROM (
        (dc.date + dc.last_block_end) - (dc.date + dc.first_block_start)
      )) / 60
    ) AS available_min
  FROM calendar_days_cache dc
  WHERE dc.family_id = _family_id
    AND dc.date = _date
    AND dc.day_status IN ('teach', 'partial')
  GROUP BY dc.child_id
),
next_event AS (
  SELECT
    e.id,
    e.child_id,
    COALESCE(c.first_name, 'Child') AS child_name,
    e.title,
    s.name AS subject,
    e.start_ts AS "when",
    e.end_ts,
    TO_CHAR((e.start_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS start_local,
    TO_CHAR((e.end_ts AT TIME ZONE (SELECT timezone FROM fam)), 'HH24:MI') AS end_local,
    EXTRACT(EPOCH FROM (e.start_ts - NOW())) / 60 AS minutes_until
  FROM events e
  LEFT JOIN subject s ON s.id = e.subject_id
  LEFT JOIN children c ON c.id = e.child_id
  WHERE e.family_id = _family_id
    AND e.status = 'scheduled'
    -- Compare using family-local time window: from now to +24h in family timezone
    AND (e.start_ts AT TIME ZONE (SELECT timezone FROM fam)) > (NOW() AT TIME ZONE (SELECT timezone FROM fam))
    AND (e.start_ts AT TIME ZONE (SELECT timezone FROM fam)) < ((NOW() + INTERVAL '24 hours') AT TIME ZONE (SELECT timezone FROM fam))
  ORDER BY e.start_ts
  LIMIT 1
),
stories AS (
  SELECT JSONB_AGG(x ORDER BY priority) AS items
  FROM (
    -- Story 1: Off day suggestion
    SELECT 
      1 AS priority,
      JSONB_BUILD_OBJECT(
        'id', 'st1',
        'title', 'Today is marked OFF — try a fun field activity',
        'tag', 'Planner',
        'kind', 'planner',
        'body', 'Your rules mark today as off. Add optional enrichment or keep it free.',
        'icon', 'calendar-off'
      ) AS story
    WHERE EXISTS (
      SELECT 1 FROM day_cache WHERE day_status = 'off'
    )
    
    UNION ALL
    
    -- Story 2: Behind on subject (placeholder - needs weekly goals)
    SELECT 
      2 AS priority,
      JSONB_BUILD_OBJECT(
        'id', 'st2',
        'title', 'Math goal is short this week — add a 20-min review',
        'tag', 'Tip',
        'kind', 'tip',
        'body', 'AI suggests a short review block to reach the weekly target.',
        'icon', 'sparkles'
      ) AS story
    WHERE FALSE -- Enable when weekly_goals table exists
    
    UNION ALL
    
    -- Story 3: Big event coming
    SELECT 
      3 AS priority,
      JSONB_BUILD_OBJECT(
        'id', 'st3',
        'title', (SELECT title FROM big_events LIMIT 1) || ' is coming — plan prep',
        'tag', 'Event',
        'kind', 'event',
        'body', 'Block a prep slot and travel time to avoid conflicts.',
        'icon', 'calendar-check'
      ) AS story
    WHERE EXISTS (SELECT 1 FROM big_events LIMIT 1)
    
    UNION ALL
    
    -- Story 4: Helpful article
    SELECT 
      4 AS priority,
      JSONB_BUILD_OBJECT(
        'id', 'st4',
        'title', 'How to pace curriculum in homeschool',
        'tag', 'Article',
        'kind', 'article',
        'body', 'Weekly pacing targets and mastery checkpoints.',
        'icon', 'book-open'
      ) AS story
    
    UNION ALL
    
    -- Story 5: All on track
    SELECT 
      5 AS priority,
      JSONB_BUILD_OBJECT(
        'id', 'st5',
        'title', 'Everyone is on track today! 🎉',
        'tag', 'Progress',
        'kind', 'celebrate',
        'body', 'All children are meeting their goals. Keep up the great work!',
        'icon', 'check-circle'
      ) AS story
    WHERE NOT EXISTS (SELECT 1 FROM day_cache WHERE day_status = 'off')
  ) x
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_home_data(UUID, DATE, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_home_data(UUID, DATE, INT) TO anon;

-- Example usage:
-- SELECT get_home_data('your-family-id'::uuid, CURRENT_DATE, 14);

