-- ============================================================
-- Missing RPC Functions for Daily Insights
-- ============================================================
-- These RPCs are called by DailyInsights.js but were missing from the database

-- ============================================================
-- Drop existing functions if they exist (to handle return type changes)
-- ============================================================

DROP FUNCTION IF EXISTS get_light_evidence_subjects(UUID, UUID);
DROP FUNCTION IF EXISTS compare_to_syllabus_week(UUID, UUID, DATE);

-- ============================================================
-- get_light_evidence_subjects
-- ============================================================
-- Returns subjects with low document upload counts (below target)

CREATE OR REPLACE FUNCTION get_light_evidence_subjects(
  p_family_id UUID,
  p_child_id UUID DEFAULT NULL
)
RETURNS TABLE (
  subject_id UUID,
  subject_name TEXT,
  file_count BIGINT,
  target INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH child_subjects AS (
    SELECT DISTINCT s.id, s.name
    FROM subject s
    INNER JOIN events e ON e.subject_id = s.id
    WHERE e.family_id = p_family_id
      AND (p_child_id IS NULL OR e.child_id = p_child_id)
  ),
  upload_counts AS (
    SELECT 
      u.subject_id,
      COUNT(*)::BIGINT AS file_count
    FROM uploads u
    WHERE u.family_id = p_family_id
      AND (p_child_id IS NULL OR u.child_id = p_child_id)
      AND u.kind IN ('pdf', 'doc', 'other')
      AND u.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY u.subject_id
  ),
  targets AS (
    SELECT 
      sdt.subject_id,
      COALESCE(sdt.monthly_target_files, 4) AS target
    FROM subject_doc_targets sdt
    WHERE sdt.family_id = p_family_id
  )
  SELECT 
    cs.id AS subject_id,
    cs.name AS subject_name,
    COALESCE(uc.file_count, 0)::BIGINT AS file_count,
    COALESCE(t.target, 4)::INTEGER AS target
  FROM child_subjects cs
  LEFT JOIN upload_counts uc ON uc.subject_id = cs.id
  LEFT JOIN targets t ON t.subject_id = cs.id
  WHERE COALESCE(uc.file_count, 0) < COALESCE(t.target, 4)
  ORDER BY cs.name;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_light_evidence_subjects(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_light_evidence_subjects(UUID, UUID) TO anon;

-- ============================================================
-- compare_to_syllabus_week
-- ============================================================
-- Compares actual done minutes vs expected weekly minutes from syllabi

CREATE OR REPLACE FUNCTION compare_to_syllabus_week(
  p_family_id UUID,
  p_child_id UUID,
  p_week_start DATE
)
RETURNS TABLE (
  subject_id UUID,
  subject_name TEXT,
  expected_weekly_minutes INTEGER,
  done_minutes INTEGER,
  scheduled_minutes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_week_end DATE;
BEGIN
  v_week_end := p_week_start + INTERVAL '6 days';
  
  RETURN QUERY
  WITH week_events AS (
    SELECT 
      e.subject_id,
      SUM(
        CASE 
          WHEN e.status = 'done' THEN
            EXTRACT(EPOCH FROM (COALESCE(e.end_ts, e.start_ts + INTERVAL '1 hour') - e.start_ts))::INT / 60
          ELSE 0
        END
      )::INTEGER AS done_minutes,
      SUM(
        CASE 
          WHEN e.status IN ('scheduled', 'in_progress', 'done') THEN
            EXTRACT(EPOCH FROM (COALESCE(e.end_ts, e.start_ts + INTERVAL '1 hour') - e.start_ts))::INT / 60
          ELSE 0
        END
      )::INTEGER AS scheduled_minutes
    FROM events e
    WHERE e.family_id = p_family_id
      AND e.child_id = p_child_id
      AND (e.start_ts AT TIME ZONE 'UTC')::DATE >= p_week_start
      AND (e.start_ts AT TIME ZONE 'UTC')::DATE <= v_week_end
    GROUP BY e.subject_id
  ),
  syllabus_targets AS (
    SELECT 
      sy.subject_id,
      s.name AS subject_name,
      sy.expected_weekly_minutes
    FROM syllabi sy
    INNER JOIN subject s ON s.id = sy.subject_id
    WHERE sy.family_id = p_family_id
      AND sy.child_id = p_child_id
      AND sy.start_date <= v_week_end
      AND sy.end_date >= p_week_start
      AND sy.expected_weekly_minutes > 0
  ),
  all_subjects_with_events AS (
    SELECT DISTINCT
      e.subject_id,
      s.name AS subject_name
    FROM events e
    INNER JOIN subject s ON s.id = e.subject_id
    WHERE e.family_id = p_family_id
      AND e.child_id = p_child_id
      AND (e.start_ts AT TIME ZONE 'UTC')::DATE >= p_week_start
      AND (e.start_ts AT TIME ZONE 'UTC')::DATE <= v_week_end
  )
  SELECT 
    COALESCE(st.subject_id, ase.subject_id) AS subject_id,
    COALESCE(st.subject_name, ase.subject_name) AS subject_name,
    COALESCE(st.expected_weekly_minutes, 0)::INTEGER AS expected_weekly_minutes,
    COALESCE(we.done_minutes, 0)::INTEGER AS done_minutes,
    COALESCE(we.scheduled_minutes, 0)::INTEGER AS scheduled_minutes
  FROM all_subjects_with_events ase
  LEFT JOIN syllabus_targets st ON st.subject_id = ase.subject_id
  LEFT JOIN week_events we ON we.subject_id = ase.subject_id
  ORDER BY COALESCE(st.subject_name, ase.subject_name);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION compare_to_syllabus_week(UUID, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION compare_to_syllabus_week(UUID, UUID, DATE) TO anon;

-- ============================================================
-- Verification
-- ============================================================

-- Check if functions exist
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_light_evidence_subjects', 'compare_to_syllabus_week')
ORDER BY routine_name;

