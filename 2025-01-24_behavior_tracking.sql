-- Behavior Tracking Layer
-- Adds emotional/context tags to event outcomes for better insights and AI recommendations

-- Add behavior_tags column to event_outcomes table
ALTER TABLE event_outcomes 
ADD COLUMN IF NOT EXISTS behavior_tags text[] DEFAULT '{}';

-- Add comment explaining the behavior tags
COMMENT ON COLUMN event_outcomes.behavior_tags IS 'Emotional/context tags: Focused, Distracted, Excited, Overwhelmed. Used for weekly stories, skill tracking, and AI recommendations.';

-- Create index for faster queries on behavior tags
CREATE INDEX IF NOT EXISTS event_outcomes_behavior_tags_idx 
ON event_outcomes USING GIN (behavior_tags);

-- Create a view for behavior analytics
CREATE OR REPLACE VIEW behavior_analytics AS
SELECT 
  child_id,
  subject_id,
  DATE_TRUNC('week', created_at) AS week_start,
  DATE_TRUNC('month', created_at) AS month_start,
  COUNT(*) FILTER (WHERE 'Focused' = ANY(behavior_tags)) AS focused_count,
  COUNT(*) FILTER (WHERE 'Distracted' = ANY(behavior_tags)) AS distracted_count,
  COUNT(*) FILTER (WHERE 'Excited' = ANY(behavior_tags)) AS excited_count,
  COUNT(*) FILTER (WHERE 'Overwhelmed' = ANY(behavior_tags)) AS overwhelmed_count,
  COUNT(*) AS total_outcomes,
  AVG(rating) AS avg_rating
FROM event_outcomes
WHERE behavior_tags IS NOT NULL AND array_length(behavior_tags, 1) > 0
GROUP BY child_id, subject_id, DATE_TRUNC('week', created_at), DATE_TRUNC('month', created_at);

-- Grant permissions
GRANT SELECT ON behavior_analytics TO authenticated;

-- Create function to get behavior trends for a child
CREATE OR REPLACE FUNCTION get_behavior_trends(
  _child_id uuid,
  _days_back integer DEFAULT 30
)
RETURNS TABLE (
  behavior_tag text,
  count bigint,
  percentage numeric,
  avg_rating numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH behavior_counts AS (
    SELECT 
      unnest(behavior_tags) AS tag,
      rating
    FROM event_outcomes
    WHERE child_id = _child_id
      AND created_at >= CURRENT_DATE - (_days_back || ' days')::interval
      AND behavior_tags IS NOT NULL
      AND array_length(behavior_tags, 1) > 0
  ),
  tag_stats AS (
    SELECT 
      tag,
      COUNT(*) AS cnt,
      AVG(rating) AS avg_rtg
    FROM behavior_counts
    GROUP BY tag
  ),
  total AS (
    SELECT SUM(cnt) AS total_count FROM tag_stats
  )
  SELECT 
    ts.tag,
    ts.cnt::bigint,
    ROUND((ts.cnt::numeric / NULLIF(t.total_count, 0)) * 100, 1) AS pct,
    ROUND(ts.avg_rtg, 1) AS avg_rtg
  FROM tag_stats ts
  CROSS JOIN total t
  ORDER BY ts.cnt DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_behavior_trends(uuid, integer) TO authenticated;

COMMENT ON FUNCTION get_behavior_trends IS 'Get behavior tag trends for a child over specified days. Returns tag, count, percentage, and average rating.';

