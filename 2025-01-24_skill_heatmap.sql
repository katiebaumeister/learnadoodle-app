-- Skill Heatmap Function
-- Returns skill mastery over time for visualization as a heatmap

-- Function: get_skill_heatmap_data
-- Returns skill mastery data grouped by week/month for heatmap visualization
CREATE OR REPLACE FUNCTION get_skill_heatmap_data(
  _child_id uuid,
  _subject_id uuid DEFAULT NULL,
  _start_date date DEFAULT CURRENT_DATE - INTERVAL '90 days',
  _end_date date DEFAULT CURRENT_DATE,
  _group_by text DEFAULT 'week' -- 'week' or 'month'
)
RETURNS TABLE (
  period_start date,
  skill_id uuid,
  skill_name text,
  skill_category text,
  avg_confidence numeric,
  evidence_count bigint,
  proficiency text
) AS $$
BEGIN
  RETURN QUERY
  WITH date_periods AS (
    SELECT 
      CASE 
        WHEN _group_by = 'month' THEN DATE_TRUNC('month', d)::date
        ELSE DATE_TRUNC('week', d)::date
      END AS period_start
    FROM generate_series(_start_date, _end_date, '1 day'::interval) d
    GROUP BY 
      CASE 
        WHEN _group_by = 'month' THEN DATE_TRUNC('month', d)::date
        ELSE DATE_TRUNC('week', d)::date
      END
  ),
  skill_evidence_by_period AS (
    SELECT 
      CASE 
        WHEN _group_by = 'month' THEN DATE_TRUNC('month', se.demonstrated_at)::date
        ELSE DATE_TRUNC('week', se.demonstrated_at)::date
      END AS period_start,
      se.skill_id,
      AVG(se.confidence_score) AS avg_conf,
      COUNT(*) AS ev_count
    FROM skill_evidence se
    JOIN skills s ON se.skill_id = s.id
    WHERE se.child_id = _child_id
      AND se.demonstrated_at >= _start_date
      AND se.demonstrated_at <= _end_date
      AND (_subject_id IS NULL OR s.subject_id = _subject_id)
    GROUP BY 
      CASE 
        WHEN _group_by = 'month' THEN DATE_TRUNC('month', se.demonstrated_at)::date
        ELSE DATE_TRUNC('week', se.demonstrated_at)::date
      END,
      se.skill_id
  ),
  skill_info AS (
    SELECT DISTINCT
      s.id,
      s.name,
      s.category
    FROM skills s
    WHERE s.family_id = (
      SELECT family_id FROM children WHERE id = _child_id
    )
    AND (_subject_id IS NULL OR s.subject_id = _subject_id)
  )
  SELECT 
    dp.period_start,
    si.id AS skill_id,
    si.name AS skill_name,
    si.category AS skill_category,
    COALESCE(sebp.avg_conf, 0)::numeric AS avg_confidence,
    COALESCE(sebp.ev_count, 0)::bigint AS evidence_count,
    CASE 
      WHEN COALESCE(sebp.avg_conf, 0) >= 4.5 THEN 'expert'
      WHEN COALESCE(sebp.avg_conf, 0) >= 3.5 THEN 'advanced'
      WHEN COALESCE(sebp.avg_conf, 0) >= 2.5 THEN 'proficient'
      WHEN COALESCE(sebp.avg_conf, 0) >= 1.5 THEN 'developing'
      ELSE 'beginner'
    END AS proficiency
  FROM date_periods dp
  CROSS JOIN skill_info si
  LEFT JOIN skill_evidence_by_period sebp ON dp.period_start = sebp.period_start AND si.id = sebp.skill_id
  ORDER BY dp.period_start, si.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_skill_heatmap_data(uuid, uuid, date, date, text) TO authenticated;

COMMENT ON FUNCTION get_skill_heatmap_data IS 'Returns skill mastery data over time for heatmap visualization. Groups by week or month and includes average confidence and evidence count per skill per period.';

