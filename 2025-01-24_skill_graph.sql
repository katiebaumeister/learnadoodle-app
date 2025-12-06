-- Skill Graph / Learning Map System
-- Tracks skills, evidence, and creates a visual learning map

-- 1) skills table - Defines skills that can be tracked
CREATE TABLE IF NOT EXISTS skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  subject_id uuid REFERENCES subject(id),
  category text, -- e.g., 'academic', 'social', 'executive_function', 'creative'
  level text, -- e.g., 'beginner', 'intermediate', 'advanced'
  parent_skill_id uuid REFERENCES skills(id), -- For skill hierarchies
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  UNIQUE(family_id, name, subject_id) -- One skill per name per subject per family
);

-- Indexes for skills
CREATE INDEX IF NOT EXISTS skills_family_id_idx ON skills(family_id);
CREATE INDEX IF NOT EXISTS skills_subject_id_idx ON skills(subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS skills_category_idx ON skills(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS skills_parent_idx ON skills(parent_skill_id) WHERE parent_skill_id IS NOT NULL;

-- Enable RLS
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS family_read_own_skills ON skills;
CREATE POLICY family_read_own_skills
ON skills
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_skills ON skills;
CREATE POLICY family_insert_own_skills
ON skills
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_skills ON skills;
CREATE POLICY family_update_own_skills
ON skills
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_skills ON skills;
CREATE POLICY family_delete_own_skills
ON skills
FOR DELETE
USING (is_family_member(family_id));

-- 2) skill_evidence table - Links evidence to skills
CREATE TABLE IF NOT EXISTS skill_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  
  -- Evidence can come from multiple sources
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  event_outcome_id uuid REFERENCES event_outcomes(id) ON DELETE CASCADE,
  upload_id uuid REFERENCES uploads(id) ON DELETE CASCADE,
  material_id uuid REFERENCES materials(id) ON DELETE CASCADE,
  
  -- Evidence metadata
  evidence_type text NOT NULL CHECK (evidence_type IN ('event', 'outcome', 'upload', 'material', 'manual')),
  proficiency_level text CHECK (proficiency_level IN ('beginner', 'developing', 'proficient', 'advanced', 'expert')),
  confidence_score integer CHECK (confidence_score >= 1 AND confidence_score <= 5), -- 1-5 scale
  note text,
  demonstrated_at timestamptz NOT NULL DEFAULT now(), -- When skill was demonstrated
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  
  -- Ensure at least one evidence source is provided
  CONSTRAINT skill_evidence_source_check CHECK (
    (event_id IS NOT NULL)::int + 
    (event_outcome_id IS NOT NULL)::int + 
    (upload_id IS NOT NULL)::int + 
    (material_id IS NOT NULL)::int >= 1
  )
);

-- Indexes for skill_evidence
CREATE INDEX IF NOT EXISTS skill_evidence_child_id_idx ON skill_evidence(child_id);
CREATE INDEX IF NOT EXISTS skill_evidence_skill_id_idx ON skill_evidence(skill_id);
CREATE INDEX IF NOT EXISTS skill_evidence_event_id_idx ON skill_evidence(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS skill_evidence_outcome_id_idx ON skill_evidence(event_outcome_id) WHERE event_outcome_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS skill_evidence_upload_id_idx ON skill_evidence(upload_id) WHERE upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS skill_evidence_demonstrated_at_idx ON skill_evidence(demonstrated_at);
CREATE INDEX IF NOT EXISTS skill_evidence_family_id_idx ON skill_evidence(family_id);

-- Enable RLS
ALTER TABLE skill_evidence ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS family_read_own_skill_evidence ON skill_evidence;
CREATE POLICY family_read_own_skill_evidence
ON skill_evidence
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_skill_evidence ON skill_evidence;
CREATE POLICY family_insert_own_skill_evidence
ON skill_evidence
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_skill_evidence ON skill_evidence;
CREATE POLICY family_update_own_skill_evidence
ON skill_evidence
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_skill_evidence ON skill_evidence;
CREATE POLICY family_delete_own_skill_evidence
ON skill_evidence
FOR DELETE
USING (is_family_member(family_id));

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON skills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON skill_evidence TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON skills TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON skill_evidence TO service_role;

-- 3) View: skill_proficiency_summary
-- Aggregates evidence to show current proficiency level per skill per child
CREATE OR REPLACE VIEW skill_proficiency_summary AS
SELECT 
  se.child_id,
  se.skill_id,
  s.name AS skill_name,
  s.category AS skill_category,
  s.subject_id,
  COUNT(*) AS evidence_count,
  AVG(se.confidence_score) AS avg_confidence,
  MAX(se.demonstrated_at) AS last_demonstrated,
  MIN(se.demonstrated_at) AS first_demonstrated,
  -- Calculate proficiency based on recent evidence
  CASE 
    WHEN AVG(se.confidence_score) >= 4.5 THEN 'expert'
    WHEN AVG(se.confidence_score) >= 3.5 THEN 'advanced'
    WHEN AVG(se.confidence_score) >= 2.5 THEN 'proficient'
    WHEN AVG(se.confidence_score) >= 1.5 THEN 'developing'
    ELSE 'beginner'
  END AS calculated_proficiency
FROM skill_evidence se
JOIN skills s ON se.skill_id = s.id
GROUP BY se.child_id, se.skill_id, s.name, s.category, s.subject_id;

-- Grant select on view
GRANT SELECT ON skill_proficiency_summary TO authenticated;

-- 4) Function: get_skill_graph_data
-- Returns skill relationships and evidence for visualization
CREATE OR REPLACE FUNCTION get_skill_graph_data(
  _child_id uuid,
  _subject_id uuid DEFAULT NULL,
  _days_back integer DEFAULT 365
)
RETURNS TABLE (
  skill_id uuid,
  skill_name text,
  skill_category text,
  subject_id uuid,
  proficiency text,
  evidence_count bigint,
  avg_confidence numeric,
  last_demonstrated timestamptz,
  parent_skill_id uuid,
  related_skills uuid[]
) AS $$
BEGIN
  RETURN QUERY
  WITH skill_data AS (
    SELECT 
      s.id,
      s.name,
      s.category,
      s.subject_id,
      s.parent_skill_id,
      COALESCE(sps.calculated_proficiency, 'beginner') AS proficiency,
      COALESCE(sps.evidence_count, 0)::bigint AS evidence_count,
      COALESCE(sps.avg_confidence, 0)::numeric AS avg_confidence,
      sps.last_demonstrated
    FROM skills s
    LEFT JOIN skill_proficiency_summary sps ON s.id = sps.skill_id AND sps.child_id = _child_id
    WHERE s.family_id = (
      SELECT family_id FROM children WHERE id = _child_id
    )
    AND (_subject_id IS NULL OR s.subject_id = _subject_id)
    AND (
      sps.last_demonstrated IS NULL OR 
      sps.last_demonstrated >= CURRENT_DATE - (_days_back || ' days')::interval
    )
  ),
  related_skills_map AS (
    SELECT 
      sd.id,
      ARRAY_AGG(DISTINCT r.id) FILTER (WHERE r.id IS NOT NULL) AS related
    FROM skill_data sd
    LEFT JOIN skills r ON r.parent_skill_id = sd.id OR r.id = sd.parent_skill_id
    GROUP BY sd.id
  )
  SELECT 
    sd.id,
    sd.name,
    sd.category,
    sd.subject_id,
    sd.proficiency,
    sd.evidence_count,
    sd.avg_confidence,
    sd.last_demonstrated,
    sd.parent_skill_id,
    COALESCE(rsm.related, ARRAY[]::uuid[]) AS related_skills
  FROM skill_data sd
  LEFT JOIN related_skills_map rsm ON sd.id = rsm.id
  ORDER BY sd.evidence_count DESC, sd.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_skill_graph_data(uuid, uuid, integer) TO authenticated;

-- 5) Function: get_skill_strengths_weaknesses
-- Identifies strengths and weaknesses based on evidence patterns
CREATE OR REPLACE FUNCTION get_skill_strengths_weaknesses(
  _child_id uuid,
  _subject_id uuid DEFAULT NULL
)
RETURNS TABLE (
  skill_id uuid,
  skill_name text,
  skill_category text,
  proficiency text,
  evidence_count bigint,
  avg_confidence numeric,
  trend text, -- 'improving', 'stable', 'declining'
  is_strength boolean,
  is_weakness boolean
) AS $$
BEGIN
  RETURN QUERY
  WITH recent_evidence AS (
    SELECT 
      se.skill_id,
      AVG(se.confidence_score) AS recent_avg,
      COUNT(*) AS recent_count
    FROM skill_evidence se
    WHERE se.child_id = _child_id
      AND se.demonstrated_at >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY se.skill_id
  ),
  older_evidence AS (
    SELECT 
      se.skill_id,
      AVG(se.confidence_score) AS older_avg,
      COUNT(*) AS older_count
    FROM skill_evidence se
    WHERE se.child_id = _child_id
      AND se.demonstrated_at >= CURRENT_DATE - INTERVAL '180 days'
      AND se.demonstrated_at < CURRENT_DATE - INTERVAL '90 days'
    GROUP BY se.skill_id
  ),
  skill_summary AS (
    SELECT 
      s.id,
      s.name,
      s.category,
      COALESCE(sps.calculated_proficiency, 'beginner') AS proficiency,
      COALESCE(sps.evidence_count, 0)::bigint AS evidence_count,
      COALESCE(sps.avg_confidence, 0)::numeric AS avg_confidence,
      COALESCE(re.recent_avg, 0)::numeric AS recent_avg,
      COALESCE(oe.older_avg, 0)::numeric AS older_avg,
      CASE 
        WHEN re.recent_avg > oe.older_avg + 0.3 THEN 'improving'
        WHEN re.recent_avg < oe.older_avg - 0.3 THEN 'declining'
        ELSE 'stable'
      END AS trend
    FROM skills s
    LEFT JOIN skill_proficiency_summary sps ON s.id = sps.skill_id AND sps.child_id = _child_id
    LEFT JOIN recent_evidence re ON s.id = re.skill_id
    LEFT JOIN older_evidence oe ON s.id = oe.skill_id
    WHERE s.family_id = (
      SELECT family_id FROM children WHERE id = _child_id
    )
    AND (_subject_id IS NULL OR s.subject_id = _subject_id)
  )
  SELECT 
    ss.id,
    ss.name,
    ss.category,
    ss.proficiency,
    ss.evidence_count,
    ss.avg_confidence,
    ss.trend,
    -- Strength: high proficiency, improving or stable, multiple evidence points
    (ss.avg_confidence >= 3.5 AND ss.evidence_count >= 3 AND ss.trend IN ('improving', 'stable')) AS is_strength,
    -- Weakness: low proficiency, declining, or insufficient evidence
    (ss.avg_confidence < 2.5 OR (ss.evidence_count < 2 AND ss.avg_confidence < 3.0) OR ss.trend = 'declining') AS is_weakness
  FROM skill_summary ss
  ORDER BY ss.avg_confidence DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_skill_strengths_weaknesses(uuid, uuid) TO authenticated;

COMMENT ON TABLE skills IS 'Defines skills that can be tracked and demonstrated';
COMMENT ON TABLE skill_evidence IS 'Links evidence (events, outcomes, uploads, materials) to skills';
COMMENT ON VIEW skill_proficiency_summary IS 'Aggregated skill proficiency per child';
COMMENT ON FUNCTION get_skill_graph_data IS 'Returns skill graph data for visualization';
COMMENT ON FUNCTION get_skill_strengths_weaknesses IS 'Identifies skill strengths and weaknesses';

