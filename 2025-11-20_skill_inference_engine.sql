-- Skill Inference Engine
-- Creates skill_scores table and infer_skills RPC function
-- Analyzes evidence, reflections, assignments, quest outcomes, and planner events to infer skill levels

-- ============================================================
-- 1. Create skill_scores table
-- ============================================================

CREATE TABLE IF NOT EXISTS skill_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  skill text NOT NULL,
  level numeric NOT NULL CHECK (level >= 0 AND level <= 5),
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  recommended_steps text[] DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(child_id, skill)
);

-- Indexes for skill_scores
CREATE INDEX IF NOT EXISTS skill_scores_child_id_idx ON skill_scores(child_id);
CREATE INDEX IF NOT EXISTS skill_scores_skill_idx ON skill_scores(skill);
CREATE INDEX IF NOT EXISTS skill_scores_level_idx ON skill_scores(level);
CREATE INDEX IF NOT EXISTS skill_scores_updated_at_idx ON skill_scores(updated_at DESC);

-- Enable RLS
ALTER TABLE skill_scores ENABLE ROW LEVEL SECURITY;

-- RLS policies using existing is_family_member helper
DROP POLICY IF EXISTS family_read_own_skill_scores ON skill_scores;
CREATE POLICY family_read_own_skill_scores
ON skill_scores
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM children c
    WHERE c.id = skill_scores.child_id
      AND is_family_member(c.family_id)
  )
);

DROP POLICY IF EXISTS family_insert_own_skill_scores ON skill_scores;
CREATE POLICY family_insert_own_skill_scores
ON skill_scores
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM children c
    WHERE c.id = skill_scores.child_id
      AND is_family_member(c.family_id)
  )
);

DROP POLICY IF EXISTS family_update_own_skill_scores ON skill_scores;
CREATE POLICY family_update_own_skill_scores
ON skill_scores
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM children c
    WHERE c.id = skill_scores.child_id
      AND is_family_member(c.family_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM children c
    WHERE c.id = skill_scores.child_id
      AND is_family_member(c.family_id)
  )
);

DROP POLICY IF EXISTS family_delete_own_skill_scores ON skill_scores;
CREATE POLICY family_delete_own_skill_scores
ON skill_scores
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM children c
    WHERE c.id = skill_scores.child_id
      AND is_family_member(c.family_id)
  )
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON skill_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON skill_scores TO service_role;

-- ============================================================
-- 2. Create infer_skills RPC function
-- ============================================================

CREATE OR REPLACE FUNCTION infer_skills(p_child_id uuid)
RETURNS TABLE (
  skill text,
  level numeric,
  confidence numeric,
  recommended_steps text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id uuid;
  v_skill_record record;
  v_skill_name text;
  v_evidence_count int;
  v_total_score numeric;
  v_confidence numeric;
  v_level numeric;
  v_recommended_steps text[];
BEGIN
  -- Get family_id from child
  SELECT family_id INTO v_family_id
  FROM children
  WHERE id = p_child_id;
  
  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Child not found';
  END IF;
  
  -- Check authorization
  IF NOT is_family_member(v_family_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  -- Create temporary table to store inferred skills
  DROP TABLE IF EXISTS temp_inferred_skills;
  CREATE TEMP TABLE temp_inferred_skills (
    skill text PRIMARY KEY,
    evidence_count int,
    total_score numeric,
    confidence numeric,
    level numeric,
    recommended_steps text[]
  );
  
  -- 1. Analyze skill_evidence table
  INSERT INTO temp_inferred_skills (skill, evidence_count, total_score, confidence, level, recommended_steps)
  SELECT 
    s.name AS skill,
    COUNT(se.id) AS evidence_count,
    COALESCE(AVG(
      CASE se.proficiency_level
        WHEN 'beginner' THEN 1.0
        WHEN 'developing' THEN 2.0
        WHEN 'proficient' THEN 3.5
        WHEN 'advanced' THEN 4.5
        WHEN 'expert' THEN 5.0
        ELSE 2.5
      END
    ), 0) AS total_score,
    LEAST(COUNT(se.id)::numeric / 10.0, 1.0) AS confidence, -- More evidence = higher confidence, capped at 1.0
    ROUND(COALESCE(AVG(
      CASE se.proficiency_level
        WHEN 'beginner' THEN 1.0
        WHEN 'developing' THEN 2.0
        WHEN 'proficient' THEN 3.5
        WHEN 'advanced' THEN 4.5
        WHEN 'expert' THEN 5.0
        ELSE 2.5
      END
    ), 0), 1) AS level,
    ARRAY[]::text[] AS recommended_steps
  FROM skill_evidence se
  JOIN skills s ON s.id = se.skill_id
  WHERE se.child_id = p_child_id
    AND se.demonstrated_at >= NOW() - INTERVAL '6 months' -- Only recent evidence
  GROUP BY s.name;
  
  -- 2. Analyze event_outcomes (strengths/struggles)
  INSERT INTO temp_inferred_skills (skill, evidence_count, total_score, confidence, level, recommended_steps)
  SELECT 
    unnest(eo.strengths) AS skill,
    1 AS evidence_count,
    4.0 AS total_score, -- Strengths indicate higher skill
    0.3 AS confidence, -- Lower confidence for single observation
    4.0 AS level,
    ARRAY[]::text[]
  FROM event_outcomes eo
  WHERE eo.child_id = p_child_id
    AND eo.strengths IS NOT NULL
    AND array_length(eo.strengths, 1) > 0
    AND eo.created_at >= NOW() - INTERVAL '6 months'
  ON CONFLICT (skill) DO UPDATE SET
    evidence_count = temp_inferred_skills.evidence_count + 1,
    total_score = (temp_inferred_skills.total_score * temp_inferred_skills.evidence_count + 4.0) / (temp_inferred_skills.evidence_count + 1),
    confidence = LEAST((temp_inferred_skills.evidence_count + 1)::numeric / 10.0, 1.0),
    level = ROUND((temp_inferred_skills.total_score * temp_inferred_skills.evidence_count + 4.0) / (temp_inferred_skills.evidence_count + 1), 1);
  
  -- Struggles indicate lower skill or areas needing work
  INSERT INTO temp_inferred_skills (skill, evidence_count, total_score, confidence, level, recommended_steps)
  SELECT 
    unnest(eo.struggles) AS skill,
    1 AS evidence_count,
    2.0 AS total_score, -- Struggles indicate lower skill
    0.3 AS confidence,
    2.0 AS level,
    ARRAY['Practice more', 'Get additional support', 'Break into smaller steps']::text[]
  FROM event_outcomes eo
  WHERE eo.child_id = p_child_id
    AND eo.struggles IS NOT NULL
    AND array_length(eo.struggles, 1) > 0
    AND eo.created_at >= NOW() - INTERVAL '6 months'
  ON CONFLICT (skill) DO UPDATE SET
    evidence_count = temp_inferred_skills.evidence_count + 1,
    total_score = (temp_inferred_skills.total_score * temp_inferred_skills.evidence_count + 2.0) / (temp_inferred_skills.evidence_count + 1),
    confidence = LEAST((temp_inferred_skills.evidence_count + 1)::numeric / 10.0, 1.0),
    level = ROUND((temp_inferred_skills.total_score * temp_inferred_skills.evidence_count + 2.0) / (temp_inferred_skills.evidence_count + 1), 1),
    recommended_steps = ARRAY['Practice more', 'Get additional support', 'Break into smaller steps']::text[];
  
  -- 3. Analyze assignments (completed = skill demonstrated)
  INSERT INTO temp_inferred_skills (skill, evidence_count, total_score, confidence, level, recommended_steps)
  SELECT 
    a.related_subject::text || ' completion' AS skill,
    COUNT(*) FILTER (WHERE a.status IN ('submitted', 'reviewed', 'accepted')) AS evidence_count,
    CASE 
      WHEN COUNT(*) FILTER (WHERE a.status IN ('submitted', 'reviewed', 'accepted'))::numeric / GREATEST(COUNT(*), 1) >= 0.8 THEN 4.0
      WHEN COUNT(*) FILTER (WHERE a.status IN ('submitted', 'reviewed', 'accepted'))::numeric / GREATEST(COUNT(*), 1) >= 0.5 THEN 3.0
      ELSE 2.0
    END AS total_score,
    LEAST(COUNT(*)::numeric / 5.0, 1.0) AS confidence,
    CASE 
      WHEN COUNT(*) FILTER (WHERE a.status IN ('submitted', 'reviewed', 'accepted'))::numeric / GREATEST(COUNT(*), 1) >= 0.8 THEN 4.0
      WHEN COUNT(*) FILTER (WHERE a.status IN ('submitted', 'reviewed', 'accepted'))::numeric / GREATEST(COUNT(*), 1) >= 0.5 THEN 3.0
      ELSE 2.0
    END AS level,
    CASE 
      WHEN COUNT(*) FILTER (WHERE a.status IN ('submitted', 'reviewed', 'accepted'))::numeric / GREATEST(COUNT(*), 1) < 0.5 THEN
        ARRAY['Complete more assignments', 'Ask for help when stuck', 'Break tasks into smaller steps']::text[]
      ELSE ARRAY[]::text[]
    END AS recommended_steps
  FROM assignments a
  WHERE a.child_id = p_child_id
    AND a.created_at >= NOW() - INTERVAL '6 months'
  GROUP BY a.related_subject
  ON CONFLICT (skill) DO UPDATE SET
    evidence_count = temp_inferred_skills.evidence_count + EXCLUDED.evidence_count,
    total_score = (temp_inferred_skills.total_score * temp_inferred_skills.evidence_count + EXCLUDED.total_score * EXCLUDED.evidence_count) / GREATEST(temp_inferred_skills.evidence_count + EXCLUDED.evidence_count, 1),
    confidence = LEAST((temp_inferred_skills.evidence_count + EXCLUDED.evidence_count)::numeric / 10.0, 1.0),
    level = ROUND((temp_inferred_skills.total_score * temp_inferred_skills.evidence_count + EXCLUDED.total_score * EXCLUDED.evidence_count) / GREATEST(temp_inferred_skills.evidence_count + EXCLUDED.evidence_count, 1), 1),
    recommended_steps = CASE 
      WHEN EXCLUDED.recommended_steps IS NOT NULL AND array_length(EXCLUDED.recommended_steps, 1) > 0 THEN EXCLUDED.recommended_steps
      ELSE temp_inferred_skills.recommended_steps
    END;
  
  -- 4. Analyze planner events (completed events = engagement/skill practice)
  INSERT INTO temp_inferred_skills (skill, evidence_count, total_score, confidence, level, recommended_steps)
  SELECT 
    COALESCE(s.name, 'General learning') AS skill,
    COUNT(*) FILTER (WHERE e.status = 'done') AS evidence_count,
    CASE 
      WHEN COUNT(*) FILTER (WHERE e.status = 'done')::numeric / GREATEST(COUNT(*), 1) >= 0.8 THEN 4.0
      WHEN COUNT(*) FILTER (WHERE e.status = 'done')::numeric / GREATEST(COUNT(*), 1) >= 0.5 THEN 3.0
      ELSE 2.0
    END AS total_score,
    LEAST(COUNT(*)::numeric / 20.0, 1.0) AS confidence,
    CASE 
      WHEN COUNT(*) FILTER (WHERE e.status = 'done')::numeric / GREATEST(COUNT(*), 1) >= 0.8 THEN 4.0
      WHEN COUNT(*) FILTER (WHERE e.status = 'done')::numeric / GREATEST(COUNT(*), 1) >= 0.5 THEN 3.0
      ELSE 2.0
    END AS level,
    CASE 
      WHEN COUNT(*) FILTER (WHERE e.status = 'done')::numeric / GREATEST(COUNT(*), 1) < 0.5 THEN
        ARRAY['Complete more learning sessions', 'Stay consistent with schedule']::text[]
      ELSE ARRAY[]::text[]
    END AS recommended_steps
  FROM events e
  LEFT JOIN subject s ON s.id = e.subject_id
  WHERE e.child_id = p_child_id
    AND e.start_ts >= NOW() - INTERVAL '6 months'
  GROUP BY s.name
  ON CONFLICT (skill) DO UPDATE SET
    evidence_count = temp_inferred_skills.evidence_count + EXCLUDED.evidence_count,
    total_score = (temp_inferred_skills.total_score * temp_inferred_skills.evidence_count + EXCLUDED.total_score * EXCLUDED.evidence_count) / GREATEST(temp_inferred_skills.evidence_count + EXCLUDED.evidence_count, 1),
    confidence = LEAST((temp_inferred_skills.evidence_count + EXCLUDED.evidence_count)::numeric / 20.0, 1.0),
    level = ROUND((temp_inferred_skills.total_score * temp_inferred_skills.evidence_count + EXCLUDED.total_score * EXCLUDED.evidence_count) / GREATEST(temp_inferred_skills.evidence_count + EXCLUDED.evidence_count, 1), 1),
    recommended_steps = CASE 
      WHEN EXCLUDED.recommended_steps IS NOT NULL AND array_length(EXCLUDED.recommended_steps, 1) > 0 THEN EXCLUDED.recommended_steps
      ELSE temp_inferred_skills.recommended_steps
    END;
  
  -- 5. Analyze notes (if they contain skill-related keywords)
  -- Extract skills from notes that mention common skill keywords
  INSERT INTO temp_inferred_skills (skill, evidence_count, total_score, confidence, level, recommended_steps)
  SELECT 
    'Reflection and self-awareness' AS skill,
    COUNT(*) AS evidence_count,
    3.5 AS total_score,
    LEAST(COUNT(*)::numeric / 10.0, 1.0) AS confidence,
    3.5 AS level,
    ARRAY[]::text[]
  FROM notes n
  WHERE n.child_id = p_child_id
    AND n.created_at >= NOW() - INTERVAL '6 months'
    AND (n.text ILIKE '%reflection%' OR n.text ILIKE '%learned%' OR n.text ILIKE '%understand%')
  ON CONFLICT (skill) DO UPDATE SET
    evidence_count = temp_inferred_skills.evidence_count + EXCLUDED.evidence_count,
    total_score = (temp_inferred_skills.total_score * temp_inferred_skills.evidence_count + EXCLUDED.total_score * EXCLUDED.evidence_count) / GREATEST(temp_inferred_skills.evidence_count + EXCLUDED.evidence_count, 1),
    confidence = LEAST((temp_inferred_skills.evidence_count + EXCLUDED.evidence_count)::numeric / 10.0, 1.0),
    level = ROUND((temp_inferred_skills.total_score * temp_inferred_skills.evidence_count + EXCLUDED.total_score * EXCLUDED.evidence_count) / GREATEST(temp_inferred_skills.evidence_count + EXCLUDED.evidence_count, 1), 1);
  
  -- Upsert into skill_scores table
  FOR v_skill_record IN SELECT * FROM temp_inferred_skills WHERE evidence_count > 0 LOOP
    INSERT INTO skill_scores (child_id, skill, level, confidence, recommended_steps, updated_at)
    VALUES (
      p_child_id,
      v_skill_record.skill,
      v_skill_record.level,
      v_skill_record.confidence,
      v_skill_record.recommended_steps,
      NOW()
    )
    ON CONFLICT (child_id, skill) DO UPDATE SET
      level = EXCLUDED.level,
      confidence = EXCLUDED.confidence,
      recommended_steps = EXCLUDED.recommended_steps,
      updated_at = NOW();
  END LOOP;
  
  -- Return all inferred skills
  RETURN QUERY
  SELECT 
    ss.skill,
    ss.level,
    ss.confidence,
    ss.recommended_steps
  FROM skill_scores ss
  WHERE ss.child_id = p_child_id
  ORDER BY ss.level DESC, ss.confidence DESC;
  
  -- Clean up temp table
  DROP TABLE IF EXISTS temp_inferred_skills;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION infer_skills(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION infer_skills(uuid) TO service_role;

-- Add comments
COMMENT ON TABLE skill_scores IS 'Inferred skill levels for children based on evidence analysis';
COMMENT ON COLUMN skill_scores.level IS 'Skill level from 0-5 (0=no evidence, 5=expert)';
COMMENT ON COLUMN skill_scores.confidence IS 'Confidence score from 0-1 (0=low confidence, 1=high confidence)';
COMMENT ON COLUMN skill_scores.recommended_steps IS 'Array of recommended next steps for skill development';

