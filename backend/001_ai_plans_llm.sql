-- Migration: AI Plans LLM Support
-- Idempotent: Uses IF NOT EXISTS

-- Tables already exist from ai_rescheduling_system.sql, but ensure RPC exists

-- Velocity-adjusted minutes helper
CREATE OR REPLACE FUNCTION get_required_minutes(
  p_family_id UUID,
  p_child_id UUID,
  p_week_start DATE,
  p_weeks_ahead INT DEFAULT 2
) RETURNS TABLE(subject_id UUID, week DATE, required_minutes INT)
LANGUAGE SQL SECURITY DEFINER AS $$
  WITH base AS (
    SELECT s.subject_id,
           generate_series(
             p_week_start,
             p_week_start + ((p_weeks_ahead-1)*7),
             interval '7 day'
           )::DATE AS week,
           s.expected_weekly_minutes
    FROM syllabi s
    WHERE s.family_id = p_family_id
      AND s.child_id = p_child_id
      AND (p_week_start BETWEEN s.start_date AND COALESCE(s.end_date, p_week_start))
  ),
  vel AS (
    SELECT subject_id, velocity
    FROM learning_velocity
    WHERE family_id = p_family_id
      AND child_id = p_child_id
  )
  SELECT b.subject_id,
         b.week,
         CEIL(b.expected_weekly_minutes * COALESCE(v.velocity, 1.0))::INT AS required_minutes
  FROM base b
  LEFT JOIN vel v USING (subject_id);
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_required_minutes(UUID, UUID, DATE, INT) TO authenticated;

-- Helper for done minutes (if not exists)
CREATE OR REPLACE FUNCTION done_minutes_for_week(
  p_family_id UUID,
  p_child_id UUID,
  p_subject_id UUID,
  p_week_start DATE
) RETURNS INT
LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::INT, 0)
  FROM events e
  WHERE e.family_id = p_family_id
    AND e.child_id = p_child_id
    AND e.subject_id = p_subject_id
    AND e.status = 'done'
    AND DATE(e.start_ts AT TIME ZONE 'UTC') >= p_week_start
    AND DATE(e.start_ts AT TIME ZONE 'UTC') < p_week_start + INTERVAL '7 days';
$$;

GRANT EXECUTE ON FUNCTION done_minutes_for_week(UUID, UUID, UUID, DATE) TO authenticated;

-- Helper for scheduled minutes (if not exists)
CREATE OR REPLACE FUNCTION scheduled_minutes_for_week(
  p_family_id UUID,
  p_child_id UUID,
  p_subject_id UUID,
  p_week_start DATE
) RETURNS INT
LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (e.end_ts - e.start_ts)) / 60)::INT, 0)
  FROM events e
  WHERE e.family_id = p_family_id
    AND e.child_id = p_child_id
    AND e.subject_id = p_subject_id
    AND e.status IN ('scheduled', 'in_progress')
    AND DATE(e.start_ts AT TIME ZONE 'UTC') >= p_week_start
    AND DATE(e.start_ts AT TIME ZONE 'UTC') < p_week_start + INTERVAL '7 days';
$$;

GRANT EXECUTE ON FUNCTION scheduled_minutes_for_week(UUID, UUID, UUID, DATE) TO authenticated;

