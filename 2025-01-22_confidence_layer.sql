-- Confidence Layer / Parent Reassurance Engine
-- This migration creates database functions and views for the "You're Doing Enough" features
-- Includes: readiness metrics, pacing analysis, evidence depth, predictions

-- ============================================================================
-- 1. READINESS METRICS VIEW (Enhanced)
-- ============================================================================

CREATE OR REPLACE VIEW confidence_readiness AS
SELECT 
  c.id AS child_id,
  c.family_id,
  c.first_name AS child_name,
  -- Attendance percentage (year to date)
  COALESCE((
    SELECT ROUND(
      (COUNT(DISTINCT ar.day_date)::numeric / 
       GREATEST(
         EXTRACT(DAY FROM (CURRENT_DATE - DATE_TRUNC('year', CURRENT_DATE)))::numeric,
         1
       )) * 100,
      1
    )
    FROM attendance_records ar
    WHERE ar.child_id = c.id
      AND ar.day_date >= DATE_TRUNC('year', CURRENT_DATE)
      AND ar.day_date <= CURRENT_DATE
      AND ar.status = 'present'
  ), 0) AS attendance_percentage,
  -- Attendance days logged
  COALESCE((
    SELECT COUNT(DISTINCT ar.day_date)
    FROM attendance_records ar
    WHERE ar.child_id = c.id
      AND ar.day_date >= DATE_TRUNC('year', CURRENT_DATE)
      AND ar.status = 'present'
  ), 0) AS attendance_days_logged,
  -- Total attendance minutes this year
  COALESCE((
    SELECT SUM(COALESCE(ar.minutes, 0))
    FROM attendance_records ar
    WHERE ar.child_id = c.id
      AND ar.day_date >= DATE_TRUNC('year', CURRENT_DATE)
  ), 0) AS attendance_minutes_this_year,
  -- Credits by subject (from grades table)
  COALESCE((
    SELECT jsonb_object_agg(subject_name, credit_data)
    FROM (
      SELECT 
        s.name AS subject_name,
        jsonb_build_object(
          'credits', COALESCE(SUM(g.credits), 0),
          'on_track', CASE 
            WHEN COALESCE(SUM(g.credits), 0) >= 0.5 THEN true 
            ELSE false 
          END,
          'status', CASE
            WHEN COALESCE(SUM(g.credits), 0) >= 1.0 THEN 'strong'
            WHEN COALESCE(SUM(g.credits), 0) >= 0.5 THEN 'on_track'
            ELSE 'building'
          END
        ) AS credit_data
      FROM grades g
      JOIN subject s ON s.id = g.subject_id
      WHERE g.child_id = c.id
        AND g.created_at >= DATE_TRUNC('year', CURRENT_DATE)
      GROUP BY s.name
    ) credit_summary
  ), '{}'::jsonb) AS credits_by_subject,
  -- Evidence depth by subject (uploads + event outcomes)
  COALESCE((
    SELECT jsonb_object_agg(subject_name, evidence_data)
    FROM (
      SELECT 
        COALESCE(s.name, 'Unassigned') AS subject_name,
        jsonb_build_object(
          'upload_count', COALESCE(upload_stats.upload_count, 0),
          'outcome_count', COALESCE(outcome_stats.outcome_count, 0),
          'total_artifacts', COALESCE(upload_stats.upload_count, 0) + COALESCE(outcome_stats.outcome_count, 0),
          'confidence', CASE
            WHEN (COALESCE(upload_stats.upload_count, 0) + COALESCE(outcome_stats.outcome_count, 0)) >= 10 THEN 'high'
            WHEN (COALESCE(upload_stats.upload_count, 0) + COALESCE(outcome_stats.outcome_count, 0)) >= 5 THEN 'medium'
            ELSE 'low'
          END
        ) AS evidence_data
      FROM subject s
      LEFT JOIN (
        SELECT u.subject_id, COUNT(*) AS upload_count
        FROM uploads u
        WHERE u.child_id = c.id
          AND u.created_at >= DATE_TRUNC('year', CURRENT_DATE)
        GROUP BY u.subject_id
      ) upload_stats ON upload_stats.subject_id = s.id
      LEFT JOIN (
        SELECT eo.subject_id, COUNT(*) AS outcome_count
        FROM event_outcomes eo
        JOIN events e ON e.id = eo.event_id
        WHERE eo.child_id = c.id
          AND eo.created_at >= DATE_TRUNC('year', CURRENT_DATE)
        GROUP BY eo.subject_id
      ) outcome_stats ON outcome_stats.subject_id = s.id
      WHERE (upload_stats.upload_count > 0 OR outcome_stats.outcome_count > 0)
        OR s.id IN (
          SELECT DISTINCT subject_id FROM events 
          WHERE child_id = c.id 
            AND start_ts >= DATE_TRUNC('year', CURRENT_DATE)
        )
    ) evidence_summary
  ), '{}'::jsonb) AS evidence_by_subject,
  -- Pacing vs plan (year plan milestones)
  COALESCE((
    SELECT jsonb_build_object(
      'planned_modules', (
        SELECT COUNT(*)
        FROM term_milestones tm
        JOIN year_plan_children ypc ON ypc.year_plan_id = tm.year_plan_id
        JOIN year_plans yp ON yp.id = tm.year_plan_id
        WHERE ypc.child_id = c.id
          AND yp.plan_scope = 'current'
          AND tm.week_start <= CURRENT_DATE
      ),
      'current_module', (
        SELECT COUNT(*)
        FROM term_milestones tm
        JOIN year_plan_children ypc ON ypc.year_plan_id = tm.year_plan_id
        JOIN year_plans yp ON yp.id = tm.year_plan_id
        WHERE ypc.child_id = c.id
          AND yp.plan_scope = 'current'
          AND tm.week_start <= CURRENT_DATE
          AND tm.week_end >= CURRENT_DATE
      ),
      'completed_modules', (
        SELECT COUNT(*)
        FROM term_milestones tm
        JOIN year_plan_children ypc ON ypc.year_plan_id = tm.year_plan_id
        JOIN year_plans yp ON yp.id = tm.year_plan_id
        WHERE ypc.child_id = c.id
          AND yp.plan_scope = 'current'
          AND tm.week_end < CURRENT_DATE
      )
    )
  ), jsonb_build_object('planned_modules', 0, 'current_module', 0, 'completed_modules', 0)) AS pacing_data,
  -- Learning velocity summary
  COALESCE((
    SELECT jsonb_object_agg(subject_name, velocity_data)
    FROM (
      SELECT 
        s.name AS subject_name,
        jsonb_build_object(
          'velocity', COALESCE(lv.velocity, 1.0),
          'status', CASE
            WHEN COALESCE(lv.velocity, 1.0) >= 1.1 THEN 'ahead'
            WHEN COALESCE(lv.velocity, 1.0) >= 0.9 THEN 'on_track'
            ELSE 'behind'
          END
        ) AS velocity_data
      FROM learning_velocity lv
      JOIN subject s ON s.id = lv.subject_id
      WHERE lv.child_id = c.id
        AND lv.family_id = c.family_id
    ) velocity_summary
  ), '{}'::jsonb) AS velocity_by_subject
FROM children c
WHERE c.archived = false;

GRANT SELECT ON confidence_readiness TO authenticated;
GRANT SELECT ON confidence_readiness TO service_role;

COMMENT ON VIEW confidence_readiness IS 'Comprehensive readiness metrics for parent reassurance dashboard';

-- ============================================================================
-- 2. WEEKLY BENCHMARKS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW weekly_benchmarks AS
SELECT 
  c.id AS child_id,
  c.family_id,
  DATE_TRUNC('week', e.start_ts AT TIME ZONE 'UTC')::date AS week_start,
  COUNT(DISTINCT CASE WHEN e.status = 'done' AND e.subject_id = s.id THEN e.id END) AS reading_sessions,
  COUNT(DISTINCT CASE WHEN e.status = 'done' AND e.subject_id = s.id AND s.name ILIKE '%writing%' THEN e.id END) AS writing_sessions,
  COUNT(DISTINCT CASE WHEN e.status = 'done' THEN e.id END) AS total_sessions,
  COUNT(DISTINCT ar.day_date) AS days_with_attendance
FROM children c
CROSS JOIN subject s
LEFT JOIN events e ON e.child_id = c.id
LEFT JOIN attendance_records ar ON ar.child_id = c.id 
  AND ar.day_date >= DATE_TRUNC('week', e.start_ts AT TIME ZONE 'UTC')::date
  AND ar.day_date < DATE_TRUNC('week', e.start_ts AT TIME ZONE 'UTC')::date + INTERVAL '7 days'
WHERE c.archived = false
  AND e.start_ts >= DATE_TRUNC('year', CURRENT_DATE)
GROUP BY c.id, c.family_id, DATE_TRUNC('week', e.start_ts AT TIME ZONE 'UTC')::date, s.id, s.name;

GRANT SELECT ON weekly_benchmarks TO authenticated;
GRANT SELECT ON weekly_benchmarks TO service_role;

-- ============================================================================
-- 3. RPC: Get Reassurance Message
-- ============================================================================

CREATE OR REPLACE FUNCTION get_reassurance_message(
  p_family_id uuid,
  p_child_id uuid,
  p_context text DEFAULT 'general'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _message text;
  _tone text;
  _data jsonb;
BEGIN
  -- Get recent activity context
  SELECT jsonb_build_object(
    'missed_this_week', (
      SELECT COUNT(*)
      FROM events e
      WHERE e.child_id = p_child_id
        AND e.family_id = p_family_id
        AND e.status = 'skipped'
        AND e.start_ts >= DATE_TRUNC('week', CURRENT_DATE)
    ),
    'completed_this_week', (
      SELECT COUNT(*)
      FROM events e
      WHERE e.child_id = p_child_id
        AND e.family_id = p_family_id
        AND e.status = 'done'
        AND e.start_ts >= DATE_TRUNC('week', CURRENT_DATE)
    ),
    'average_missed_per_week', (
      SELECT COALESCE(AVG(weekly_missed), 0)
      FROM (
        SELECT COUNT(*) AS weekly_missed
        FROM events e
        WHERE e.child_id = p_child_id
          AND e.family_id = p_family_id
          AND e.status = 'skipped'
          AND e.start_ts >= DATE_TRUNC('year', CURRENT_DATE)
        GROUP BY DATE_TRUNC('week', e.start_ts)
      ) weekly_stats
    )
  ) INTO _data;

  -- Generate context-appropriate message
  IF p_context = 'late_completion' THEN
    _message := 'Totally normal! The average family has 2-3 missed lessons per week.';
    _tone := 'reassuring';
  ELSIF p_context = 'skipped_item' THEN
    _message := 'We''ll automatically adapt pacing — you''re still on track.';
    _tone := 'supportive';
  ELSIF p_context = 'low_evidence' THEN
    _message := 'This subject has plenty of buffer built in.';
    _tone := 'reassuring';
  ELSE
    -- General reassurance based on data
    IF (_data->>'missed_this_week')::int <= 3 THEN
      _message := 'You''re doing great! Your consistency this week is excellent.';
      _tone := 'encouraging';
    ELSE
      _message := 'This is within the normal range. Most families have occasional dips.';
      _tone := 'reassuring';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'message', _message,
    'tone', _tone,
    'context', p_context,
    'data', _data
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_reassurance_message(uuid, uuid, text) TO authenticated;

-- ============================================================================
-- 4. RPC: Get Pacing Prediction
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pacing_prediction(
  p_family_id uuid,
  p_child_id uuid,
  p_subject_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prediction jsonb;
  _current_velocity numeric;
  _year_plan_end date;
  _weeks_remaining int;
  _projected_completion date;
BEGIN
  -- Get current learning velocity
  SELECT COALESCE(velocity, 1.0) INTO _current_velocity
  FROM learning_velocity
  WHERE family_id = p_family_id
    AND child_id = p_child_id
    AND (p_subject_id IS NULL OR subject_id = p_subject_id)
  ORDER BY last_updated DESC
  LIMIT 1;

  -- Get year plan end date
  SELECT yp.end_date INTO _year_plan_end
  FROM year_plans yp
  JOIN year_plan_children ypc ON ypc.year_plan_id = yp.id
  WHERE yp.family_id = p_family_id
    AND ypc.child_id = p_child_id
    AND yp.plan_scope = 'current'
  ORDER BY yp.created_at DESC
  LIMIT 1;

  IF _year_plan_end IS NULL THEN
    RETURN jsonb_build_object(
      'prediction', 'No year plan found',
      'status', 'no_plan'
    );
  END IF;

  _weeks_remaining := GREATEST(0, CEIL((_year_plan_end - CURRENT_DATE)::numeric / 7));

  -- Project completion based on velocity
  IF _current_velocity >= 1.0 THEN
    _projected_completion := CURRENT_DATE + (_weeks_remaining * 7 * (1.0 / _current_velocity))::int;
    IF _projected_completion <= _year_plan_end THEN
      RETURN jsonb_build_object(
        'prediction', format('At your current pace, you''ll comfortably finish the year plan by %s.', TO_CHAR(_projected_completion, 'Month DD')),
        'status', 'on_track',
        'projected_completion', _projected_completion,
        'weeks_remaining', _weeks_remaining,
        'velocity', _current_velocity
      );
    ELSE
      RETURN jsonb_build_object(
        'prediction', format('You''re slightly behind, but there''s buffer built in. Consider adding micro-sessions next week.'),
        'status', 'slightly_behind',
        'projected_completion', _projected_completion,
        'weeks_remaining', _weeks_remaining,
        'velocity', _current_velocity
      );
    END IF;
  ELSE
    RETURN jsonb_build_object(
      'prediction', format('Pacing has dipped slightly — I''ve already adjusted expectations. Still on track for %s.', TO_CHAR(_year_plan_end, 'Month DD')),
      'status', 'adjusted',
      'projected_completion', _year_plan_end,
      'weeks_remaining', _weeks_remaining,
      'velocity', _current_velocity
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION get_pacing_prediction(uuid, uuid, uuid) TO authenticated;

-- ============================================================================
-- 5. RPC: Get Student Streak Data
-- ============================================================================

CREATE OR REPLACE FUNCTION get_student_streak_data(
  p_family_id uuid,
  p_child_id uuid,
  p_days_back int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_streak int;
  _longest_streak int;
  _streak_broken_date date;
  _recent_completions int;
BEGIN
  -- Calculate current streak
  WITH daily_completions AS (
    SELECT DISTINCT DATE(e.start_ts AT TIME ZONE 'UTC') AS completion_date
    FROM events e
    WHERE e.child_id = p_child_id
      AND e.family_id = p_family_id
      AND e.status = 'done'
      AND e.start_ts >= CURRENT_DATE - (p_days_back || ' days')::interval
    ORDER BY completion_date DESC
  ),
  streaks AS (
    SELECT 
      completion_date,
      ROW_NUMBER() OVER (ORDER BY completion_date DESC) AS rn,
      completion_date - (ROW_NUMBER() OVER (ORDER BY completion_date DESC) || ' days')::interval AS streak_group
    FROM daily_completions
  )
  SELECT 
    COUNT(*) FILTER (WHERE streak_group = (SELECT streak_group FROM streaks ORDER BY completion_date DESC LIMIT 1)),
    MAX(COUNT(*)) OVER ()
  INTO _current_streak, _longest_streak
  FROM streaks
  GROUP BY streak_group;

  -- Get recent completions (last 7 days)
  SELECT COUNT(DISTINCT DATE(e.start_ts AT TIME ZONE 'UTC'))
  INTO _recent_completions
  FROM events e
  WHERE e.child_id = p_child_id
    AND e.family_id = p_family_id
    AND e.status = 'done'
    AND e.start_ts >= CURRENT_DATE - INTERVAL '7 days';

  RETURN jsonb_build_object(
    'current_streak', COALESCE(_current_streak, 0),
    'longest_streak', COALESCE(_longest_streak, 0),
    'recent_completions', COALESCE(_recent_completions, 0),
    'message', CASE
      WHEN _current_streak >= 4 THEN format('%s kept a %s-day streak — this is amazing consistency for their age.', 
        (SELECT first_name FROM children WHERE id = p_child_id), _current_streak)
      WHEN _current_streak >= 2 THEN format('%s has a %s-day streak — great consistency!', 
        (SELECT first_name FROM children WHERE id = p_child_id), _current_streak)
      WHEN _recent_completions >= 4 THEN format('%s completed %s days this week — excellent progress!', 
        (SELECT first_name FROM children WHERE id = p_child_id), _recent_completions)
      ELSE format('Totally normal dip — most kids have fluctuating streaks. No concern here.')
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_student_streak_data(uuid, uuid, int) TO authenticated;

COMMENT ON FUNCTION get_student_streak_data IS 'Get student completion streak data for parent reassurance';

