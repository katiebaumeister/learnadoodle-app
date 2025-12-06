-- Planner Smart Suggestions System
-- Creates planner_suggestions table and generate_daily_suggestions RPC
-- Safe to run multiple times (IF NOT EXISTS guards)

-- ============================================================
-- 0. Ensure get_family_timezone function exists
-- ============================================================

CREATE OR REPLACE FUNCTION get_family_timezone(p_family_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION get_family_timezone(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_family_timezone(uuid) TO service_role;

-- ============================================================
-- 1. Create planner_suggestions table
-- ============================================================

CREATE TABLE IF NOT EXISTS planner_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id) ON DELETE CASCADE,
  suggestion_type text NOT NULL CHECK (suggestion_type IN ('tonight_prep', 'week_smoothing', 'overload_warning', 'long_gap', 'under_covered')),
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'urgent')),
  context_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  dismissed_at timestamptz,
  dismissed_by uuid REFERENCES profiles(id)
);

-- Indexes for planner_suggestions
CREATE INDEX IF NOT EXISTS planner_suggestions_family_idx ON planner_suggestions(family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS planner_suggestions_child_idx ON planner_suggestions(child_id, created_at DESC) WHERE child_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS planner_suggestions_type_idx ON planner_suggestions(suggestion_type);
CREATE INDEX IF NOT EXISTS planner_suggestions_active_idx ON planner_suggestions(family_id, created_at DESC) WHERE dismissed_at IS NULL;

-- Enable RLS
ALTER TABLE planner_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS policies using existing is_family_member helper
DROP POLICY IF EXISTS family_read_own_suggestions ON planner_suggestions;
CREATE POLICY family_read_own_suggestions
ON planner_suggestions
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_suggestions ON planner_suggestions;
CREATE POLICY family_insert_own_suggestions
ON planner_suggestions
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_suggestions ON planner_suggestions;
CREATE POLICY family_update_own_suggestions
ON planner_suggestions
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON planner_suggestions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON planner_suggestions TO service_role;

-- ============================================================
-- 2. Create generate_daily_suggestions RPC function
-- ============================================================

CREATE OR REPLACE FUNCTION generate_daily_suggestions(
  p_family_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  id uuid,
  family_id uuid,
  child_id uuid,
  child_name text,
  suggestion_type text,
  message text,
  severity text,
  context_json jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone text;
  v_today_start timestamptz;
  v_today_end timestamptz;
  v_week_start date;
  v_week_end date;
  v_child_id uuid;
  v_suggestion_record planner_suggestions%ROWTYPE;
BEGIN
  -- Get family timezone
  SELECT get_family_timezone(p_family_id) INTO v_timezone;
  
  -- Calculate date boundaries
  v_today_start := (p_date::date AT TIME ZONE v_timezone)::timestamptz;
  v_today_end := v_today_start + INTERVAL '1 day';
  v_week_start := p_date::date - (EXTRACT(DOW FROM p_date::date)::int - 1);
  v_week_end := v_week_start + INTERVAL '7 days';
  
  -- Clear old suggestions for this family (older than 1 day)
  DELETE FROM planner_suggestions ps
  WHERE ps.family_id = p_family_id
    AND ps.created_at < NOW() - INTERVAL '1 day'
    AND ps.dismissed_at IS NULL;
  
  -- ============================================================
  -- Suggestion 1: Tonight Prep
  -- Check if there are events scheduled for tomorrow morning
  -- ============================================================
  FOR v_child_id IN
    SELECT DISTINCT e.child_id::uuid
    FROM events e
    INNER JOIN children c ON c.id = e.child_id AND c.family_id = p_family_id
    WHERE e.family_id = p_family_id
      AND e.status = 'scheduled'
      AND e.start_ts >= v_today_end
      AND e.start_ts < v_today_end + INTERVAL '12 hours'
      AND NOT EXISTS (
        SELECT 1 FROM planner_suggestions ps
        WHERE ps.family_id = p_family_id
          AND ps.child_id = e.child_id
          AND ps.suggestion_type = 'tonight_prep'
          AND ps.created_at::date = p_date
          AND ps.dismissed_at IS NULL
      )
  LOOP
    INSERT INTO planner_suggestions (
      family_id,
      child_id,
      suggestion_type,
      message,
      severity,
      context_json
    )
    VALUES (
      p_family_id,
      v_child_id,
      'tonight_prep',
      'Prepare materials tonight for tomorrow morning''s sessions',
      'info',
      jsonb_build_object(
        'date', p_date,
        'tomorrow_date', (p_date + INTERVAL '1 day')::date
      )
    );
  END LOOP;
  
  -- ============================================================
  -- Suggestion 2: Week Smoothing
  -- Check for uneven distribution of events across the week
  -- ============================================================
  FOR v_child_id IN
    WITH week_distribution AS (
      SELECT
        c.id AS child_id,
        DATE((e.start_ts AT TIME ZONE v_timezone)) AS event_date,
        COUNT(*) AS event_count,
        SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60) AS total_minutes
      FROM children c
      LEFT JOIN events e ON e.child_id = c.id
        AND e.family_id = p_family_id
        AND e.status = 'scheduled'
        AND e.start_ts >= (v_week_start::date AT TIME ZONE v_timezone)::timestamptz
        AND e.start_ts < (v_week_end::date AT TIME ZONE v_timezone)::timestamptz
      WHERE c.family_id = p_family_id
      GROUP BY c.id, DATE((e.start_ts AT TIME ZONE v_timezone))
    ),
    day_stats AS (
      SELECT
        wd.child_id,
        COUNT(DISTINCT wd.event_date) AS days_with_events,
        AVG(wd.total_minutes) AS avg_minutes,
        MAX(wd.total_minutes) AS max_minutes,
        MIN(wd.total_minutes) AS min_minutes
      FROM week_distribution wd
      WHERE wd.event_date IS NOT NULL
      GROUP BY wd.child_id
    )
    SELECT DISTINCT ds.child_id::uuid
    FROM day_stats ds
    WHERE ds.days_with_events >= 3
      AND (ds.max_minutes - ds.min_minutes) > ds.avg_minutes * 0.5
      AND NOT EXISTS (
        SELECT 1 FROM planner_suggestions ps
        WHERE ps.family_id = p_family_id
          AND ps.child_id = ds.child_id
          AND ps.suggestion_type = 'week_smoothing'
          AND ps.created_at::date = p_date
          AND ps.dismissed_at IS NULL
      )
  LOOP
    INSERT INTO planner_suggestions (
      family_id,
      child_id,
      suggestion_type,
      message,
      severity,
      context_json
    )
    VALUES (
      p_family_id,
      v_child_id,
      'week_smoothing',
      'Consider smoothing out this week''s schedule for more even distribution',
      'info',
      jsonb_build_object(
        'week_start', v_week_start,
        'week_end', v_week_end
      )
    );
  END LOOP;
  
  -- ============================================================
  -- Suggestion 3: Overload Warnings
  -- Check for days with too many hours scheduled
  -- ============================================================
  FOR v_child_id IN
    WITH daily_load AS (
      SELECT
        e.child_id::uuid AS child_id,
        DATE((e.start_ts AT TIME ZONE v_timezone)) AS event_date,
        SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60) AS total_minutes
      FROM events e
      WHERE e.family_id = p_family_id
        AND e.status = 'scheduled'
        AND e.start_ts >= v_today_start
        AND e.start_ts < v_week_end::date AT TIME ZONE v_timezone + INTERVAL '1 day'
      GROUP BY e.child_id, DATE((e.start_ts AT TIME ZONE v_timezone))
    )
    SELECT DISTINCT dl.child_id::uuid
    FROM daily_load dl
    WHERE dl.total_minutes > 360  -- More than 6 hours
      AND NOT EXISTS (
        SELECT 1 FROM planner_suggestions ps
        WHERE ps.family_id = p_family_id
          AND ps.child_id = dl.child_id
          AND ps.suggestion_type = 'overload_warning'
          AND ps.created_at::date = p_date
          AND ps.dismissed_at IS NULL
      )
  LOOP
    INSERT INTO planner_suggestions (
      family_id,
      child_id,
      suggestion_type,
      message,
      severity,
      context_json
    )
    VALUES (
      p_family_id,
      v_child_id,
      'overload_warning',
      'Heavy day detected - consider spreading sessions across multiple days',
      'warning',
      jsonb_build_object(
        'date', p_date,
        'threshold_minutes', 360
      )
    );
  END LOOP;
  
  -- ============================================================
  -- Suggestion 4: Long Gaps in Subjects
  -- Check for subjects that haven't been scheduled in a while
  -- ============================================================
  FOR v_child_id IN
    WITH last_subject_event AS (
      SELECT
        e.child_id::uuid AS child_id,
        e.subject_id,
        MAX(e.start_ts) AS last_event_date
      FROM events e
      WHERE e.family_id = p_family_id
        AND e.status IN ('scheduled', 'done')
        AND e.subject_id IS NOT NULL
      GROUP BY e.child_id, e.subject_id
    ),
    subject_gaps AS (
      SELECT
        lse.child_id::uuid AS child_id,
        lse.subject_id,
        s.name AS subject_name,
        EXTRACT(EPOCH FROM (v_today_start - lse.last_event_date)) / 86400 AS days_since
      FROM last_subject_event lse
      INNER JOIN subject s ON s.id = lse.subject_id AND s.family_id = p_family_id
      WHERE lse.last_event_date < v_today_start - INTERVAL '7 days'
    )
    SELECT DISTINCT sg.child_id::uuid
    FROM subject_gaps sg
    WHERE sg.days_since > 7
      AND NOT EXISTS (
        SELECT 1 FROM planner_suggestions ps
        WHERE ps.family_id = p_family_id
          AND ps.child_id = sg.child_id
          AND ps.suggestion_type = 'long_gap'
          AND ps.created_at::date = p_date
          AND ps.dismissed_at IS NULL
      )
  LOOP
    INSERT INTO planner_suggestions (
      family_id,
      child_id,
      suggestion_type,
      message,
      severity,
      context_json
    )
    VALUES (
      p_family_id,
      v_child_id,
      'long_gap',
      'Some subjects haven''t been scheduled in over a week - consider adding sessions',
      'info',
      jsonb_build_object(
        'threshold_days', 7
      )
    );
  END LOOP;
  
  -- ============================================================
  -- Suggestion 5: Under-covered Subjects
  -- Check for subjects with very few scheduled minutes this week
  -- ============================================================
  FOR v_child_id IN
    WITH weekly_subject_coverage AS (
      SELECT
        e.child_id::uuid AS child_id,
        e.subject_id,
        s.name AS subject_name,
        SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60) AS total_minutes
      FROM events e
      JOIN subject s ON s.id = e.subject_id
        AND s.family_id = p_family_id
      WHERE e.family_id = p_family_id
        AND e.status = 'scheduled'
        AND e.start_ts >= (v_week_start::date AT TIME ZONE v_timezone)::timestamptz
        AND e.start_ts < (v_week_end::date AT TIME ZONE v_timezone)::timestamptz
      GROUP BY e.child_id, e.subject_id, s.name
    ),
    all_child_subjects AS (
      SELECT DISTINCT
        c.id AS child_id,
        s.id AS subject_id,
        s.name AS subject_name
      FROM children c
      INNER JOIN subject s ON s.family_id = c.family_id
      WHERE c.family_id = p_family_id
        AND s.family_id = p_family_id
    )
    SELECT DISTINCT acs.child_id::uuid
    FROM all_child_subjects acs
    LEFT JOIN weekly_subject_coverage wsc ON wsc.child_id = acs.child_id AND wsc.subject_id = acs.subject_id
    WHERE COALESCE(wsc.total_minutes, 0) < 60  -- Less than 1 hour this week
      AND NOT EXISTS (
        SELECT 1 FROM planner_suggestions ps
        WHERE ps.family_id = p_family_id
          AND ps.child_id = acs.child_id
          AND ps.suggestion_type = 'under_covered'
          AND ps.created_at::date = p_date
          AND ps.dismissed_at IS NULL
      )
  LOOP
    INSERT INTO planner_suggestions (
      family_id,
      child_id,
      suggestion_type,
      message,
      severity,
      context_json
    )
    VALUES (
      p_family_id,
      v_child_id,
      'under_covered',
      'Some subjects have minimal coverage this week - consider adding more sessions',
      'info',
      jsonb_build_object(
        'week_start', v_week_start,
        'threshold_minutes', 60
      )
    );
  END LOOP;
  
  -- Return all active suggestions for this family
  -- Use explicit column references to avoid ambiguity with RETURNS TABLE column names
  RETURN QUERY
  SELECT
    ps.id::uuid,
    ps.family_id::uuid,
    ps.child_id::uuid,
    COALESCE(c.first_name, 'Child')::text AS child_name,
    ps.suggestion_type::text,
    ps.message::text,
    ps.severity::text,
    ps.context_json::jsonb,
    ps.created_at::timestamptz
  FROM planner_suggestions ps
  LEFT JOIN children c ON c.id = ps.child_id
  WHERE ps.family_id = p_family_id
    AND ps.created_at::date = p_date
    AND ps.dismissed_at IS NULL
  ORDER BY
    CASE ps.severity
      WHEN 'urgent' THEN 1
      WHEN 'warning' THEN 2
      WHEN 'info' THEN 3
    END,
    ps.created_at DESC;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION generate_daily_suggestions(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_daily_suggestions(uuid, date) TO service_role;

-- Add comments
COMMENT ON TABLE planner_suggestions IS 'Smart suggestions for planner optimization';
COMMENT ON COLUMN planner_suggestions.suggestion_type IS 'Type: tonight_prep, week_smoothing, overload_warning, long_gap, under_covered';
COMMENT ON COLUMN planner_suggestions.context_json IS 'Additional context data for the suggestion (dates, thresholds, etc.)';

