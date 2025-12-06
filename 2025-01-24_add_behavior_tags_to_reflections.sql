-- Add behavior_tags to reflection_prompts table
-- Extends behavior tracking to reflections for better weekly stories and AI recommendations

-- Add behavior_tags column to reflection_prompts table
ALTER TABLE reflection_prompts 
ADD COLUMN IF NOT EXISTS behavior_tags text[] DEFAULT '{}';

-- Add comment explaining the behavior tags
COMMENT ON COLUMN reflection_prompts.behavior_tags IS 'Emotional/context tags: Focused, Distracted, Excited, Overwhelmed. Used for weekly stories, skill tracking, and AI recommendations.';

-- Create index for faster queries on behavior tags
CREATE INDEX IF NOT EXISTS reflection_prompts_behavior_tags_idx 
ON reflection_prompts USING GIN (behavior_tags);

-- Update behavior_analytics view to include reflection data
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
FROM (
  SELECT child_id, subject_id, created_at, behavior_tags, rating
  FROM event_outcomes
  WHERE behavior_tags IS NOT NULL AND array_length(behavior_tags, 1) > 0
  UNION ALL
  SELECT 
    rp.child_id,
    e.subject_id,
    rp.created_at,
    rp.behavior_tags,
    rp.rating
  FROM reflection_prompts rp
  LEFT JOIN events e ON rp.event_id = e.id
  WHERE rp.behavior_tags IS NOT NULL AND array_length(rp.behavior_tags, 1) > 0
) combined_behavior
GROUP BY child_id, subject_id, DATE_TRUNC('week', created_at), DATE_TRUNC('month', created_at);

-- Update get_behavior_trends function to include reflection data
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
    -- From event_outcomes
    SELECT 
      unnest(behavior_tags) AS tag,
      rating
    FROM event_outcomes
    WHERE child_id = _child_id
      AND created_at >= CURRENT_DATE - (_days_back || ' days')::interval
      AND behavior_tags IS NOT NULL
      AND array_length(behavior_tags, 1) > 0
    UNION ALL
    -- From reflection_prompts
    SELECT 
      unnest(behavior_tags) AS tag,
      rating
    FROM reflection_prompts
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

-- Grant execute permission (already granted, but ensuring it's there)
GRANT EXECUTE ON FUNCTION get_behavior_trends(uuid, integer) TO authenticated;

COMMENT ON FUNCTION get_behavior_trends IS 'Get behavior tag trends for a child over specified days. Includes both event_outcomes and reflection_prompts. Returns tag, count, percentage, and average rating.';

