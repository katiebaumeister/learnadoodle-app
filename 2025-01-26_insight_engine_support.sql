-- Insight Engine Database Support
-- Adds tables and functions needed for the Insight Engine on the home page
-- Safe to run multiple times (IF NOT EXISTS guards)

-- ============================================================
-- 1. child_learning_patterns table
-- Stores computed learning patterns for insight generation
-- ============================================================

CREATE TABLE IF NOT EXISTS child_learning_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  
  -- Subject patterns
  struggle_subjects text[] DEFAULT '{}'::text[],
  strong_subjects text[] DEFAULT '{}'::text[],
  
  -- Pace and attendance
  pace_variance numeric DEFAULT 0, -- Standard deviation of session durations
  attendance_reliability numeric DEFAULT 0.8, -- 0-1 score
  current_streak integer DEFAULT 0, -- Days with at least one completed session
  
  -- Preferences (learned over time)
  preferred_time_of_day text, -- 'morning', 'afternoon', 'evening'
  preferred_session_length integer, -- Minutes
  preferred_subjects text[] DEFAULT '{}'::text[],
  low_frustration_subjects text[] DEFAULT '{}'::text[],
  
  -- Performance metrics
  average_rating numeric, -- From event_outcomes.rating
  mood_score numeric DEFAULT 0.5, -- 0-1, computed from reflections
  
  -- Computed at
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_for_date date NOT NULL DEFAULT CURRENT_DATE,
  
  UNIQUE(child_id, computed_for_date)
);

CREATE INDEX IF NOT EXISTS idx_learning_patterns_child ON child_learning_patterns(child_id, computed_for_date DESC);
CREATE INDEX IF NOT EXISTS idx_learning_patterns_family ON child_learning_patterns(family_id);

-- Enable RLS
ALTER TABLE child_learning_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_patterns ON child_learning_patterns;
CREATE POLICY family_read_own_patterns
ON child_learning_patterns
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS system_insert_patterns ON child_learning_patterns;
CREATE POLICY system_insert_patterns
ON child_learning_patterns
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS system_update_patterns ON child_learning_patterns;
CREATE POLICY system_update_patterns
ON child_learning_patterns
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

-- ============================================================
-- 2. parent_behavior_patterns table
-- Tracks parent behavior for insight generation
-- ============================================================

CREATE TABLE IF NOT EXISTS parent_behavior_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES profiles(id),
  
  -- Logging patterns
  logging_frequency numeric DEFAULT 0.8, -- 0-1 score
  late_blocks_count integer DEFAULT 0, -- Events logged after completion time
  over_scheduling_tendency numeric DEFAULT 0, -- 0-1 score
  
  -- Rescheduling patterns
  reschedule_frequency numeric DEFAULT 0, -- Events moved per week
  preferred_time_of_day text, -- When parent typically schedules
  
  -- Computed at
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_for_week_start date NOT NULL DEFAULT date_trunc('week', CURRENT_DATE)::date,
  
  UNIQUE(family_id, computed_for_week_start)
);

CREATE INDEX IF NOT EXISTS idx_parent_patterns_family ON parent_behavior_patterns(family_id, computed_for_week_start DESC);

-- Enable RLS
ALTER TABLE parent_behavior_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_parent_patterns ON parent_behavior_patterns;
CREATE POLICY family_read_own_parent_patterns
ON parent_behavior_patterns
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS system_insert_parent_patterns ON parent_behavior_patterns;
CREATE POLICY system_insert_parent_patterns
ON parent_behavior_patterns
FOR INSERT
WITH CHECK (is_family_member(family_id));

-- ============================================================
-- 3. subject_coverage_tracking table
-- Tracks coverage per subject per child for strategic insights
-- ============================================================

CREATE TABLE IF NOT EXISTS subject_coverage_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subject(id),
  subject_name text NOT NULL,
  
  -- Coverage metrics
  target_minutes_per_week integer,
  actual_minutes_last_7_days integer DEFAULT 0,
  actual_minutes_last_30_days integer DEFAULT 0,
  
  -- Status
  coverage_status text DEFAULT 'on_track' CHECK (coverage_status IN ('on_track', 'low', 'ahead')),
  minutes_needed integer DEFAULT 0, -- Minutes needed to reach target
  
  -- Computed at
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_for_date date NOT NULL DEFAULT CURRENT_DATE,
  
  UNIQUE(child_id, subject_id, computed_for_date)
);

CREATE INDEX IF NOT EXISTS idx_coverage_child ON subject_coverage_tracking(child_id, computed_for_date DESC);
CREATE INDEX IF NOT EXISTS idx_coverage_family ON subject_coverage_tracking(family_id);
CREATE INDEX IF NOT EXISTS idx_coverage_status ON subject_coverage_tracking(coverage_status) WHERE coverage_status = 'low';

-- Enable RLS
ALTER TABLE subject_coverage_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_coverage ON subject_coverage_tracking;
CREATE POLICY family_read_own_coverage
ON subject_coverage_tracking
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS system_insert_coverage ON subject_coverage_tracking;
CREATE POLICY system_insert_coverage
ON subject_coverage_tracking
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS system_update_coverage ON subject_coverage_tracking;
CREATE POLICY system_update_coverage
ON subject_coverage_tracking
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

-- ============================================================
-- 4. Helper function: Calculate child streak
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_child_streak(_child_id uuid, _as_of_date date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  streak_count integer := 0;
  check_date date := _as_of_date;
  has_record boolean;
BEGIN
  LOOP
    -- Check if there's an attendance record for this date
    SELECT EXISTS(
      SELECT 1 FROM attendance_records
      WHERE child_id = _child_id
        AND day_date = check_date
        AND status IN ('present', 'partial')
    ) INTO has_record;
    
    IF has_record THEN
      streak_count := streak_count + 1;
      check_date := check_date - INTERVAL '1 day';
    ELSE
      EXIT;
    END IF;
    
    -- Safety limit
    IF streak_count > 365 THEN
      EXIT;
    END IF;
  END LOOP;
  
  RETURN streak_count;
END;
$$;

-- ============================================================
-- 5. Helper function: Get low coverage subjects
-- ============================================================

CREATE OR REPLACE FUNCTION get_low_coverage_subjects(
  _family_id uuid,
  _child_id uuid DEFAULT NULL,
  _days_back integer DEFAULT 7
)
RETURNS TABLE (
  child_id uuid,
  subject_id uuid,
  subject_name text,
  target_minutes integer,
  actual_minutes integer,
  minutes_needed integer
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  _start_date date := CURRENT_DATE - (_days_back || ' days')::interval;
BEGIN
  RETURN QUERY
  WITH child_goals AS (
    SELECT 
      sg.child_id,
      sg.subject_id,
      s.name AS subject_name,
      sg.minutes_per_week AS target_minutes
    FROM subject_goals sg
    JOIN subject s ON s.id = sg.subject_id
    WHERE sg.family_id = _family_id
      AND (_child_id IS NULL OR sg.child_id = _child_id)
      AND sg.minutes_per_week > 0
  ),
  actual_minutes AS (
    SELECT 
      e.child_id,
      e.subject_id,
      SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::integer AS total_minutes
    FROM events e
    JOIN attendance_records ar ON ar.event_id = e.id
    WHERE e.family_id = _family_id
      AND (_child_id IS NULL OR e.child_id = _child_id)
      AND ar.day_date >= _start_date
      AND ar.status IN ('present', 'partial')
    GROUP BY e.child_id, e.subject_id
  )
  SELECT 
    cg.child_id,
    cg.subject_id,
    cg.subject_name,
    cg.target_minutes,
    COALESCE(am.total_minutes, 0) AS actual_minutes,
    GREATEST(0, cg.target_minutes - COALESCE(am.total_minutes, 0)) AS minutes_needed
  FROM child_goals cg
  LEFT JOIN actual_minutes am ON am.child_id = cg.child_id AND am.subject_id = cg.subject_id
  WHERE COALESCE(am.total_minutes, 0) < cg.target_minutes
  ORDER BY minutes_needed DESC;
END;
$$;

-- ============================================================
-- 6. Update get_home_data to include insight-relevant data
-- ============================================================

-- Note: This extends the existing get_home_data function
-- You may need to merge this with your existing implementation

CREATE OR REPLACE FUNCTION get_home_data_with_insights(
  _family_id uuid,
  _date date DEFAULT CURRENT_DATE,
  _horizon_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Call existing get_home_data
  SELECT get_home_data(_family_id, _date, _horizon_days) INTO result;
  
  -- Add insight-specific data
  result := result || jsonb_build_object(
    'insight_context', (
      SELECT jsonb_build_object(
        'low_coverage_subjects', (
          SELECT jsonb_agg(jsonb_build_object(
            'child_id', child_id,
            'subject_id', subject_id,
            'subject_name', subject_name,
            'minutes_needed', minutes_needed
          ))
          FROM get_low_coverage_subjects(_family_id, NULL, 7)
        ),
        'child_streaks', (
          SELECT jsonb_object_agg(
            c.id::text,
            calculate_child_streak(c.id, _date)
          )
          FROM children c
          WHERE c.family_id = _family_id
        )
      )
    )
  );
  
  RETURN result;
END;
$$;

-- ============================================================
-- 7. Function to compute learning patterns (call periodically)
-- ============================================================

CREATE OR REPLACE FUNCTION compute_learning_patterns(
  _family_id uuid,
  _for_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  _child record;
  _streak integer;
  _avg_rating numeric;
  _mood_score numeric;
BEGIN
  FOR _child IN 
    SELECT id FROM children WHERE family_id = _family_id
  LOOP
    -- Calculate streak
    _streak := calculate_child_streak(_child.id, _for_date);
    
    -- Calculate average rating from event_outcomes
    SELECT AVG(rating) INTO _avg_rating
    FROM event_outcomes eo
    JOIN events e ON e.id = eo.event_id
    WHERE e.child_id = _child.id
      AND e.start_ts >= (_for_date - INTERVAL '30 days')
      AND eo.rating IS NOT NULL;
    
    -- Calculate mood score from notes/reflections
    -- This is simplified - you may want more sophisticated sentiment analysis
    SELECT 
      CASE 
        WHEN COUNT(*) = 0 THEN 0.5
        ELSE AVG(
          CASE 
            WHEN type = 'celebration' THEN 0.9
            WHEN type = 'milestone' THEN 0.8
            WHEN type = 'concern' THEN 0.2
            WHEN type = 'reflection' THEN 0.5
            ELSE 0.5
          END
        )
      END
    INTO _mood_score
    FROM notes
    WHERE child_id = _child.id
      AND created_at >= (_for_date - INTERVAL '7 days');
    
    -- Upsert pattern
    INSERT INTO child_learning_patterns (
      child_id,
      family_id,
      current_streak,
      average_rating,
      mood_score,
      computed_for_date
    )
    VALUES (
      _child.id,
      _family_id,
      _streak,
      _avg_rating,
      COALESCE(_mood_score, 0.5),
      _for_date
    )
    ON CONFLICT (child_id, computed_for_date)
    DO UPDATE SET
      current_streak = EXCLUDED.current_streak,
      average_rating = EXCLUDED.average_rating,
      mood_score = EXCLUDED.mood_score,
      computed_at = now();
  END LOOP;
END;
$$;

-- ============================================================
-- 8. Function to compute coverage tracking
-- ============================================================

CREATE OR REPLACE FUNCTION compute_coverage_tracking(
  _family_id uuid,
  _for_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  _coverage record;
BEGIN
  -- Delete old tracking for this date
  DELETE FROM subject_coverage_tracking
  WHERE family_id = _family_id
    AND computed_for_date = _for_date;
  
  -- Insert new tracking
  INSERT INTO subject_coverage_tracking (
    child_id,
    family_id,
    subject_id,
    subject_name,
    target_minutes_per_week,
    actual_minutes_last_7_days,
    coverage_status,
    minutes_needed,
    computed_for_date
  )
  SELECT 
    child_id,
    _family_id,
    subject_id,
    subject_name,
    target_minutes,
    actual_minutes,
    CASE 
      WHEN actual_minutes >= target_minutes THEN 'on_track'
      WHEN actual_minutes < (target_minutes * 0.7) THEN 'low'
      ELSE 'on_track'
    END,
    GREATEST(0, target_minutes - actual_minutes),
    _for_date
  FROM get_low_coverage_subjects(_family_id, NULL, 7);
END;
$$;

-- ============================================================
-- 9. Grant permissions
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON child_learning_patterns TO authenticated;
GRANT SELECT, INSERT ON parent_behavior_patterns TO authenticated;
GRANT SELECT, INSERT, UPDATE ON subject_coverage_tracking TO authenticated;

-- ============================================================
-- Notes:
-- 1. Run compute_learning_patterns() daily via cron or scheduled job
-- 2. Run compute_coverage_tracking() daily or weekly
-- 3. The Insight Engine can query these tables for context
-- 4. child_support_profiles already exists - use it for cognitive profiles
-- ============================================================

