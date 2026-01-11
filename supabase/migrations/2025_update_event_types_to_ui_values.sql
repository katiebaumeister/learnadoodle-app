-- =====================================================
-- Update Event Types to Match UI Filter Values
-- Single source of truth: 'Lesson', 'Activity', 'Assignment', 'Family Event'
-- =====================================================

-- Step 1: Update existing data to use new event type values
-- Map old values to new values
UPDATE events
SET event_type = 'Lesson'
WHERE event_type IN ('Home Lesson', 'Core Class', 'Live Class');

UPDATE events
SET event_type = 'Activity'
WHERE event_type = 'Activity'; -- Already correct, but keeping for consistency

-- Change "Family Event" to "Other"
UPDATE events
SET event_type = 'Other'
WHERE event_type = 'Family Event';

-- Set NULL event types to "Other" (default)
UPDATE events
SET event_type = 'Other'
WHERE event_type IS NULL;

-- Step 2: Drop the old constraint
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;

-- Step 3: Add new constraint with UI-aligned values
-- Note: event_type is now required (NOT NULL) and defaults to 'Other'
ALTER TABLE events
  ALTER COLUMN event_type SET DEFAULT 'Other';

ALTER TABLE events
  ALTER COLUMN event_type SET NOT NULL;

ALTER TABLE events
  ADD CONSTRAINT events_event_type_check 
  CHECK (event_type IN (
    'Lesson',
    'Activity', 
    'Assignment',
    'Sport',
    'Appointment',
    'Extracurricular',
    'Other'
  ));

-- Step 4: Add comment for documentation
COMMENT ON COLUMN events.event_type IS 'Event type matching UI filter values: Lesson, Activity, Assignment, Sport, Appointment, Extracurricular, Other (required, defaults to Other)';

-- Step 5: Update the get_month_view RPC to include event_type
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
    e.event_type,  -- ADDED: Include event_type
    e.recurrence_rule,  -- ADDED: Include recurrence_rule for recurring events
    e.parent_event_id,  -- ADDED: Include parent_event_id for recurring instances
    e.recurrence_id,  -- ADDED: Include recurrence_id for recurring series
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
        'event_type', event_type,  -- ADDED: Include event_type in JSON output
        'recurrence_rule', recurrence_rule,  -- ADDED: Include recurrence_rule for recurring events
        'parent_event_id', parent_event_id,  -- ADDED: Include parent_event_id for recurring instances
        'recurrence_id', recurrence_id  -- ADDED: Include recurrence_id for recurring series
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_month_view(UUID, INTEGER, INTEGER, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_month_view(UUID, INTEGER, INTEGER, UUID[]) TO anon;

-- Verification query
DO $$
DECLARE
  v_lesson_count INTEGER;
  v_activity_count INTEGER;
  v_assignment_count INTEGER;
  v_family_event_count INTEGER;
  v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_lesson_count FROM events WHERE event_type = 'Lesson';
  SELECT COUNT(*) INTO v_activity_count FROM events WHERE event_type = 'Activity';
  SELECT COUNT(*) INTO v_assignment_count FROM events WHERE event_type = 'Assignment';
  SELECT COUNT(*) INTO v_family_event_count FROM events WHERE event_type = 'Other';
  SELECT COUNT(*) INTO v_null_count FROM events WHERE event_type IS NULL;
  
  RAISE NOTICE '╔════════════════════════════════════════╗';
  RAISE NOTICE '║  EVENT TYPES MIGRATION COMPLETE        ║';
  RAISE NOTICE '╚════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Event Type Counts:';
  RAISE NOTICE '  Lesson: %', v_lesson_count;
  RAISE NOTICE '  Activity: %', v_activity_count;
  RAISE NOTICE '  Assignment: %', v_assignment_count;
  RAISE NOTICE '  Other: %', v_family_event_count;
  RAISE NOTICE '  NULL: %', v_null_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Event types: Lesson, Activity, Assignment, Sport, Appointment, Extracurricular, Other';
  RAISE NOTICE '✅ event_type is now required and defaults to "Other"';
  RAISE NOTICE '';
  RAISE NOTICE '✅ get_month_view RPC updated to include event_type';
  RAISE NOTICE '✅ Database constraint updated to match UI values';
END$$;

