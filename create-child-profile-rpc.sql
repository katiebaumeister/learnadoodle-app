-- RPC for Child Profile (Goals & Progress)
-- Returns goals, weekly progress, and preferences for a child

-- Note: subject_goals table already exists from create-subject-goals-system.sql
-- Schema: id, child_id, subject_id (TEXT), minutes_per_week, cadence, priority, is_active

-- Create child_prefs table if it doesn't exist
CREATE TABLE IF NOT EXISTS child_prefs (
  child_id UUID PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
  morning_person BOOLEAN,
  focus_span_min INT DEFAULT 25,
  avoid_days INT[] NULL,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Now create the function

CREATE OR REPLACE FUNCTION get_child_profile(
  _child_id UUID,
  _week_start DATE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_child JSONB;
  v_goals JSONB;
  v_events JSONB;
  v_total_minutes INT;
  v_done_minutes INT;
  v_completion_pct INT;
  v_ai_comment TEXT;
BEGIN
  -- Child info
  SELECT JSONB_BUILD_OBJECT(
    'id', c.id,
    'name', COALESCE(c.first_name, 'Child'),
    'avatar', c.avatar
  )
  INTO v_child
  FROM children c
  WHERE c.id = _child_id;

  -- Goals with scheduled/done minutes for the week
  WITH scheduled AS (
    SELECT 
      e.subject_id,
      SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::int AS scheduled_min
    FROM events e
    WHERE e.child_id = _child_id
      AND e.start_ts >= _week_start::timestamptz
      AND e.start_ts < (_week_start + 7)::timestamptz
      AND e.status IN ('scheduled', 'done')
    GROUP BY e.subject_id
  ),
  done AS (
    SELECT 
      e.subject_id,
      SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::int AS done_min
    FROM events e
    WHERE e.child_id = _child_id
      AND e.start_ts >= _week_start::timestamptz
      AND e.start_ts < (_week_start + 7)::timestamptz
      AND e.status = 'done'
    GROUP BY e.subject_id
  )
  SELECT COALESCE(
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'goal_id', sg.id,
        'subject_id', sg.subject_id,
        'subject', COALESCE(s.name, sg.subject_id::text),
        'minutes_per_week', sg.minutes_per_week,
        'scheduled_min', COALESCE(sched.scheduled_min, 0),
        'done_min', COALESCE(done_agg.done_min, 0),
        'priority', sg.priority
      )
      ORDER BY sg.priority DESC, sg.subject_id
    ),
    '[]'::jsonb
  )
  INTO v_goals
  FROM subject_goals sg
  LEFT JOIN subject s ON s.id::text = sg.subject_id::text
  LEFT JOIN scheduled sched ON sched.subject_id::text = sg.subject_id::text
  LEFT JOIN done done_agg ON done_agg.subject_id::text = sg.subject_id::text
  WHERE sg.child_id = _child_id
    AND sg.is_active = true;

  -- Events feed for the week
  SELECT COALESCE(
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', e.id,
        'title', COALESCE(e.title, e.subject_id::text),
        'subject', e.subject_id::text,
        'status', e.status,
        'start_ts', e.start_ts,
        'end_ts', e.end_ts,
        'duration_min', GREATEST(1, EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::int
      )
      ORDER BY e.start_ts
    ),
    '[]'::jsonb
  )
  INTO v_events
  FROM events e
  WHERE e.child_id = _child_id
    AND e.start_ts >= _week_start::timestamptz
    AND e.start_ts < (_week_start + 7)::timestamptz;

  -- Summary totals
  SELECT
    COALESCE(SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::int, 0),
    COALESCE(SUM(
      CASE WHEN e.status = 'done' 
      THEN EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60 
      ELSE 0 END
    )::int, 0)
  INTO v_total_minutes, v_done_minutes
  FROM events e
  WHERE e.child_id = _child_id
    AND e.start_ts >= _week_start::timestamptz
    AND e.start_ts < (_week_start + 7)::timestamptz
    AND e.status IN ('scheduled', 'done');

  v_completion_pct := CASE 
    WHEN v_total_minutes > 0 
    THEN ROUND(100.0 * v_done_minutes::numeric / v_total_minutes)::int
    ELSE 0 
  END;

  -- AI comment (heuristic for now)
  v_ai_comment := CASE
    WHEN v_completion_pct >= 85 THEN 'Great momentum—keep the streak going!'
    WHEN v_completion_pct >= 50 THEN 'Good progress—one or two focused blocks will finish the targets.'
    WHEN v_completion_pct > 0 THEN 'A few sessions landed; schedule short top-offs to build rhythm.'
    ELSE 'No completed sessions yet—start with a 20-min block in a favorite subject.'
  END;

  RETURN JSONB_BUILD_OBJECT(
    'child', v_child,
    'goals', v_goals,
    'events', v_events,
    'summary', JSONB_BUILD_OBJECT(
      'total_minutes', v_total_minutes,
      'done_minutes', v_done_minutes,
      'completion_pct', v_completion_pct,
      'ai_comment', v_ai_comment
    ),
    'prefs', (
      SELECT TO_JSONB(cp)
      FROM child_prefs cp
      WHERE cp.child_id = _child_id
    )
  );
END $$;

-- Enable RLS on tables
ALTER TABLE subject_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_prefs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view subject goals for their children" ON subject_goals;
DROP POLICY IF EXISTS "Users can manage subject goals for their children" ON subject_goals;
DROP POLICY IF EXISTS "Users can view child prefs for their children" ON child_prefs;
DROP POLICY IF EXISTS "Users can manage child prefs for their children" ON child_prefs;

-- Create RLS policies for subject_goals
CREATE POLICY "Users can view subject goals for their children"
ON subject_goals FOR SELECT
USING (
  child_id IN (
    SELECT c.id 
    FROM children c 
    JOIN profiles p ON c.family_id = p.family_id 
    WHERE p.id = auth.uid()
  )
);

CREATE POLICY "Users can manage subject goals for their children"
ON subject_goals FOR ALL
USING (
  child_id IN (
    SELECT c.id 
    FROM children c 
    JOIN profiles p ON c.family_id = p.family_id 
    WHERE p.id = auth.uid()
  )
);

-- Create RLS policies for child_prefs
CREATE POLICY "Users can view child prefs for their children"
ON child_prefs FOR SELECT
USING (
  child_id IN (
    SELECT c.id 
    FROM children c 
    JOIN profiles p ON c.family_id = p.family_id 
    WHERE p.id = auth.uid()
  )
);

CREATE POLICY "Users can manage child prefs for their children"
ON child_prefs FOR ALL
USING (
  child_id IN (
    SELECT c.id 
    FROM children c 
    JOIN profiles p ON c.family_id = p.family_id 
    WHERE p.id = auth.uid()
  )
);

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_child_profile(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_child_profile(UUID, DATE) TO anon;
GRANT EXECUTE ON FUNCTION get_child_profile(UUID, DATE) TO service_role;
