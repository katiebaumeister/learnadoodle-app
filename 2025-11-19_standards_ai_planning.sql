-- Standards-Based AI Planning System
-- Comprehensive database schema for state standards, curriculum mapping, and AI-assisted planning
-- Safe to run multiple times (IF NOT EXISTS guards)

-- ============================================================================
-- 1) STANDARDS TABLE
-- Stores all state educational standards (Common Core, state-specific, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL CHECK (char_length(state_code) = 2), -- e.g., 'VA', 'GA', 'CA'
  grade_level text NOT NULL, -- e.g., 'K', '1', '2', ..., '12', or 'K-2', '3-5'
  subject text NOT NULL, -- e.g., 'Math', 'ELA', 'Science', 'Social Studies'
  domain text, -- e.g., 'Number & Operations', 'Reading Literature'
  standard_code text NOT NULL, -- e.g., '4.3', 'RL.4.1', 'VA.MATH.4.3'
  standard_text text NOT NULL, -- Full description of the standard
  learning_objectives jsonb, -- Array of specific learning objectives
  prerequisites text[], -- Array of prerequisite standard codes
  estimated_hours numeric DEFAULT 0, -- Estimated hours to cover this standard
  difficulty_level text CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure unique standards
  UNIQUE (state_code, grade_level, subject, standard_code)
);

-- Indexes for standards queries
CREATE INDEX IF NOT EXISTS standards_state_grade_subject_idx ON standards(state_code, grade_level, subject);
CREATE INDEX IF NOT EXISTS standards_code_idx ON standards(standard_code);
CREATE INDEX IF NOT EXISTS standards_subject_idx ON standards(subject);
CREATE INDEX IF NOT EXISTS standards_grade_idx ON standards(grade_level);

-- ============================================================================
-- 2) USER STANDARDS PREFERENCES
-- Which standards each child is following (state/grade/subject combinations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_standards_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  state_code text NOT NULL CHECK (char_length(state_code) = 2),
  grade_level text NOT NULL,
  subject_id uuid REFERENCES subject(id), -- NULL means all subjects for this grade
  standards_set text, -- e.g., "Common Core", "VA SOL", "GA Standards"
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for preferences
CREATE INDEX IF NOT EXISTS user_standards_prefs_child_idx ON user_standards_preferences(child_id);
CREATE INDEX IF NOT EXISTS user_standards_prefs_family_idx ON user_standards_preferences(family_id);
CREATE INDEX IF NOT EXISTS user_standards_prefs_active_idx ON user_standards_preferences(is_active) WHERE is_active = true;

-- Partial unique index: One active preference per child/subject/state/grade combination
CREATE UNIQUE INDEX IF NOT EXISTS user_standards_prefs_unique_active 
ON user_standards_preferences(child_id, state_code, grade_level, COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid))
WHERE is_active = true;

-- ============================================================================
-- 3) CURRICULUM STANDARDS MAPPING
-- Maps user's subjects/units/lessons to specific standards
-- ============================================================================
CREATE TABLE IF NOT EXISTS curriculum_standards_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subject(id),
  event_id uuid REFERENCES events(id), -- If mapped to a specific event
  standard_id uuid NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  mapping_type text NOT NULL CHECK (mapping_type IN ('full', 'partial', 'prerequisite')),
  -- full = completely covers this standard
  -- partial = partially covers this standard
  -- prerequisite = prepares for this standard
  notes text, -- User notes about how this maps
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Indexes for mapping queries
CREATE INDEX IF NOT EXISTS curriculum_mapping_child_subject_idx ON curriculum_standards_mapping(child_id, subject_id);
CREATE INDEX IF NOT EXISTS curriculum_mapping_standard_idx ON curriculum_standards_mapping(standard_id);
CREATE INDEX IF NOT EXISTS curriculum_mapping_event_idx ON curriculum_standards_mapping(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS curriculum_mapping_family_idx ON curriculum_standards_mapping(family_id);

-- ============================================================================
-- 4) STANDARDS COVERAGE TRACKING
-- Tracks which standards have been covered (via completed events/outcomes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS standards_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  standard_id uuid NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id), -- Event that covered this standard
  outcome_id uuid REFERENCES event_outcomes(id), -- Optional: specific outcome/assessment
  coverage_status text NOT NULL CHECK (coverage_status IN ('introduced', 'practiced', 'mastered', 'assessed')),
  coverage_date date NOT NULL DEFAULT CURRENT_DATE,
  evidence text, -- Notes or evidence of coverage
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Indexes for coverage queries
CREATE INDEX IF NOT EXISTS standards_coverage_child_idx ON standards_coverage(child_id);
CREATE INDEX IF NOT EXISTS standards_coverage_standard_idx ON standards_coverage(standard_id);
CREATE INDEX IF NOT EXISTS standards_coverage_event_idx ON standards_coverage(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS standards_coverage_date_idx ON standards_coverage(coverage_date DESC);
CREATE INDEX IF NOT EXISTS standards_coverage_status_idx ON standards_coverage(coverage_status);
CREATE INDEX IF NOT EXISTS standards_coverage_family_idx ON standards_coverage(family_id);

-- Partial unique index: One coverage record per standard/event combination (when event_id is not null)
CREATE UNIQUE INDEX IF NOT EXISTS standards_coverage_unique_event 
ON standards_coverage(standard_id, event_id)
WHERE event_id IS NOT NULL;

-- ============================================================================
-- 5) STANDARDS GAP ANALYSIS (Materialized view for performance)
-- Shows which standards are missing coverage for each child
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS standards_gap_analysis AS
SELECT 
  usp.child_id,
  usp.state_code,
  usp.grade_level,
  s.id as standard_id,
  s.subject,
  s.standard_code,
  s.standard_text,
  s.estimated_hours,
  COALESCE(MAX(sc.coverage_date), NULL) as last_covered_date,
  COUNT(DISTINCT sc.id) as coverage_count,
  MAX(sc.coverage_status) as highest_status,
  CASE 
    WHEN COUNT(DISTINCT sc.id) = 0 THEN 'not_started'
    WHEN MAX(sc.coverage_status) = 'mastered' THEN 'mastered'
    WHEN MAX(sc.coverage_status) = 'assessed' THEN 'assessed'
    WHEN MAX(sc.coverage_status) = 'practiced' THEN 'practiced'
    ELSE 'introduced'
  END as current_status
FROM user_standards_preferences usp
INNER JOIN standards s ON (
  s.state_code = usp.state_code 
  AND s.grade_level = usp.grade_level
  AND (usp.subject_id IS NULL OR EXISTS (
    SELECT 1 FROM subject subj 
    WHERE subj.id = usp.subject_id 
    AND subj.name ILIKE '%' || s.subject || '%'
  ))
)
LEFT JOIN standards_coverage sc ON (
  sc.child_id = usp.child_id 
  AND sc.standard_id = s.id
)
WHERE usp.is_active = true
GROUP BY usp.child_id, usp.state_code, usp.grade_level, s.id, s.subject, s.standard_code, s.standard_text, s.estimated_hours;

-- Index for gap analysis queries
CREATE INDEX IF NOT EXISTS standards_gap_analysis_child_idx ON standards_gap_analysis(child_id);
CREATE INDEX IF NOT EXISTS standards_gap_analysis_status_idx ON standards_gap_analysis(current_status);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_standards_gap_analysis()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY standards_gap_analysis;
END;
$$;

-- ============================================================================
-- 6) RLS POLICIES
-- ============================================================================

-- Standards table: Read-only for authenticated users (standards are public data)
ALTER TABLE standards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read standards" ON standards;
CREATE POLICY "Anyone can read standards" ON standards
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage standards" ON standards;
CREATE POLICY "Service role can manage standards" ON standards
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- User standards preferences: Family members can manage their own
ALTER TABLE user_standards_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Family members can view preferences" ON user_standards_preferences;
CREATE POLICY "Family members can view preferences" ON user_standards_preferences
  FOR SELECT
  TO authenticated
  USING (is_family_member(family_id));

DROP POLICY IF EXISTS "Family members can insert preferences" ON user_standards_preferences;
CREATE POLICY "Family members can insert preferences" ON user_standards_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "Family members can update preferences" ON user_standards_preferences;
CREATE POLICY "Family members can update preferences" ON user_standards_preferences
  FOR UPDATE
  TO authenticated
  USING (is_family_member(family_id))
  WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "Service role can manage preferences" ON user_standards_preferences;
CREATE POLICY "Service role can manage preferences" ON user_standards_preferences
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Curriculum standards mapping: Family members can manage their own
ALTER TABLE curriculum_standards_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Family members can view mappings" ON curriculum_standards_mapping;
CREATE POLICY "Family members can view mappings" ON curriculum_standards_mapping
  FOR SELECT
  TO authenticated
  USING (is_family_member(family_id));

DROP POLICY IF EXISTS "Family members can insert mappings" ON curriculum_standards_mapping;
CREATE POLICY "Family members can insert mappings" ON curriculum_standards_mapping
  FOR INSERT
  TO authenticated
  WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "Family members can update mappings" ON curriculum_standards_mapping;
CREATE POLICY "Family members can update mappings" ON curriculum_standards_mapping
  FOR UPDATE
  TO authenticated
  USING (is_family_member(family_id))
  WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "Family members can delete mappings" ON curriculum_standards_mapping;
CREATE POLICY "Family members can delete mappings" ON curriculum_standards_mapping
  FOR DELETE
  TO authenticated
  USING (is_family_member(family_id));

DROP POLICY IF EXISTS "Service role can manage mappings" ON curriculum_standards_mapping;
CREATE POLICY "Service role can manage mappings" ON curriculum_standards_mapping
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Standards coverage: Family members can manage their own
ALTER TABLE standards_coverage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Family members can view coverage" ON standards_coverage;
CREATE POLICY "Family members can view coverage" ON standards_coverage
  FOR SELECT
  TO authenticated
  USING (is_family_member(family_id));

DROP POLICY IF EXISTS "Family members can insert coverage" ON standards_coverage;
CREATE POLICY "Family members can insert coverage" ON standards_coverage
  FOR INSERT
  TO authenticated
  WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "Family members can update coverage" ON standards_coverage;
CREATE POLICY "Family members can update coverage" ON standards_coverage
  FOR UPDATE
  TO authenticated
  USING (is_family_member(family_id))
  WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "Service role can manage coverage" ON standards_coverage;
CREATE POLICY "Service role can manage coverage" ON standards_coverage
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 7) GRANTS
-- ============================================================================
GRANT SELECT ON standards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_standards_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON curriculum_standards_mapping TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON standards_coverage TO authenticated;
GRANT SELECT ON standards_gap_analysis TO authenticated;

GRANT ALL ON standards TO service_role;
GRANT ALL ON user_standards_preferences TO service_role;
GRANT ALL ON curriculum_standards_mapping TO service_role;
GRANT ALL ON standards_coverage TO service_role;
GRANT ALL ON standards_gap_analysis TO service_role;

-- ============================================================================
-- 8) TRIGGERS
-- Auto-update updated_at timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_standards_updated_at ON standards;
CREATE TRIGGER update_standards_updated_at
  BEFORE UPDATE ON standards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_standards_prefs_updated_at ON user_standards_preferences;
CREATE TRIGGER update_user_standards_prefs_updated_at
  BEFORE UPDATE ON user_standards_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 9) HELPER FUNCTIONS
-- ============================================================================

-- Function to get coverage percentage for a child/subject/state/grade
CREATE OR REPLACE FUNCTION get_standards_coverage_percentage(
  p_child_id uuid,
  p_state_code text,
  p_grade_level text,
  p_subject text DEFAULT NULL
)
RETURNS TABLE (
  total_standards bigint,
  covered_standards bigint,
  coverage_percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT s.id)::bigint as total_standards,
    COUNT(DISTINCT CASE WHEN sc.id IS NOT NULL THEN s.id END)::bigint as covered_standards,
    CASE 
      WHEN COUNT(DISTINCT s.id) > 0 
      THEN ROUND(100.0 * COUNT(DISTINCT CASE WHEN sc.id IS NOT NULL THEN s.id END) / COUNT(DISTINCT s.id), 2)
      ELSE 0
    END as coverage_percentage
  FROM user_standards_preferences usp
  INNER JOIN standards s ON (
    s.state_code = usp.state_code 
    AND s.grade_level = usp.grade_level
    AND (p_subject IS NULL OR s.subject = p_subject)
  )
  LEFT JOIN standards_coverage sc ON (
    sc.child_id = usp.child_id 
    AND sc.standard_id = s.id
  )
  WHERE usp.child_id = p_child_id
    AND usp.state_code = p_state_code
    AND usp.grade_level = p_grade_level
    AND usp.is_active = true
  GROUP BY usp.child_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_standards_coverage_percentage(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_standards_coverage_percentage(uuid, text, text, text) TO service_role;

-- Function to get uncovered standards (gaps) for AI planning
CREATE OR REPLACE FUNCTION get_standards_gaps(
  p_child_id uuid,
  p_state_code text,
  p_grade_level text,
  p_subject text DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  standard_id uuid,
  standard_code text,
  standard_text text,
  subject text,
  estimated_hours numeric,
  prerequisites text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as standard_id,
    s.standard_code,
    s.standard_text,
    s.subject,
    s.estimated_hours,
    s.prerequisites
  FROM user_standards_preferences usp
  INNER JOIN standards s ON (
    s.state_code = usp.state_code 
    AND s.grade_level = usp.grade_level
    AND (p_subject IS NULL OR s.subject = p_subject)
  )
  LEFT JOIN standards_coverage sc ON (
    sc.child_id = usp.child_id 
    AND sc.standard_id = s.id
  )
  WHERE usp.child_id = p_child_id
    AND usp.state_code = p_state_code
    AND usp.grade_level = p_grade_level
    AND usp.is_active = true
    AND sc.id IS NULL -- Not covered yet
  ORDER BY s.standard_code
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_standards_gaps(uuid, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_standards_gaps(uuid, text, text, text, integer) TO service_role;

COMMENT ON TABLE standards IS 'Educational standards by state, grade, and subject';
COMMENT ON TABLE user_standards_preferences IS 'Which standards each child is following';
COMMENT ON TABLE curriculum_standards_mapping IS 'Maps user curriculum to standards';
COMMENT ON TABLE standards_coverage IS 'Tracks which standards have been covered';
COMMENT ON MATERIALIZED VIEW standards_gap_analysis IS 'Pre-computed gap analysis for performance';

