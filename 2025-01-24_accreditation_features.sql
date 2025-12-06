-- Accreditation & Defensibility Features
-- Implements: Academic Coverage Map, Simple Mastery Charts, College Readiness Dashboard

-- ============================================================
-- 1. Academic Coverage Map
-- ============================================================

CREATE TABLE IF NOT EXISTS academic_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  academic_year text NOT NULL, -- e.g., "2024-2025"
  
  -- Coverage data (JSONB)
  coverage_data jsonb NOT NULL DEFAULT '{}',
  -- Structure:
  -- {
  --   "subjects": {
  --     "subject_id": {
  --       "name": "Math",
  --       "hours": 180,
  --       "credits": 1.0,
  --       "evidence_count": 25,
  --       "topics_covered": ["Algebra", "Geometry"],
  --       "standards_met": ["CCSS.MATH.8.1", ...]
  --     },
  --     ...
  --   }
  -- }
  
  -- Calculated metrics
  total_hours numeric(6,2),
  total_credits numeric(4,2),
  coverage_percentage numeric(5,2), -- % of required coverage
  
  calculated_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(child_id, academic_year)
);

CREATE INDEX IF NOT EXISTS academic_coverage_child_idx ON academic_coverage(child_id);
CREATE INDEX IF NOT EXISTS academic_coverage_year_idx ON academic_coverage(academic_year);
CREATE INDEX IF NOT EXISTS academic_coverage_family_idx ON academic_coverage(family_id);

-- RLS policies
ALTER TABLE academic_coverage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_academic_coverage ON academic_coverage;
CREATE POLICY family_read_academic_coverage
ON academic_coverage
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_academic_coverage ON academic_coverage;
CREATE POLICY family_insert_academic_coverage
ON academic_coverage
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_academic_coverage ON academic_coverage;
CREATE POLICY family_update_academic_coverage
ON academic_coverage
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

-- ============================================================
-- 2. Simple Mastery Charts
-- ============================================================

CREATE TABLE IF NOT EXISTS mastery_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  
  -- Mastery data (JSONB)
  mastery_data jsonb NOT NULL DEFAULT '{}',
  -- Structure:
  -- {
  --   "skills": {
  --     "skill_id": {
  --       "name": "Algebra Basics",
  --       "mastery_level": 4.2, // 1-5 scale
  --       "evidence_count": 12,
  --       "trend": "improving" // improving, stable, declining
  --     },
  --     ...
  --   },
  --   "subjects": {
  --     "subject_id": {
  --       "name": "Math",
  --       "avg_mastery": 4.0,
  --       "skills_count": 15
  --     },
  --     ...
  --   }
  -- }
  
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(child_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS mastery_snapshots_child_idx ON mastery_snapshots(child_id);
CREATE INDEX IF NOT EXISTS mastery_snapshots_date_idx ON mastery_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS mastery_snapshots_family_idx ON mastery_snapshots(family_id);

-- RLS policies
ALTER TABLE mastery_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_mastery_snapshots ON mastery_snapshots;
CREATE POLICY family_read_mastery_snapshots
ON mastery_snapshots
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_mastery_snapshots ON mastery_snapshots;
CREATE POLICY family_insert_mastery_snapshots
ON mastery_snapshots
FOR INSERT
WITH CHECK (is_family_member(family_id));

-- ============================================================
-- 3. College Readiness Dashboard
-- ============================================================

CREATE TABLE IF NOT EXISTS college_readiness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  
  -- Readiness metrics (JSONB)
  readiness_data jsonb NOT NULL DEFAULT '{}',
  -- Structure:
  -- {
  --   "academic": {
  --     "gpa": 3.8,
  --     "credits_earned": 24.0,
  --     "ap_courses": 3,
  --     "honors_courses": 5
  --   },
  --   "standardized_tests": {
  --     "sat_score": 1350,
  --     "act_score": 30,
  --     "test_dates": [...]
  --   },
  --   "extracurriculars": {
  --     "activities": [...],
  --     "leadership_roles": [...],
  --     "volunteer_hours": 120
  --   },
  --   "readiness_score": 85, // 0-100
  --   "recommendations": [...]
  -- }
  
  calculated_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(child_id)
);

CREATE INDEX IF NOT EXISTS college_readiness_child_idx ON college_readiness(child_id);
CREATE INDEX IF NOT EXISTS college_readiness_family_idx ON college_readiness(family_id);

-- RLS policies
ALTER TABLE college_readiness ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_college_readiness ON college_readiness;
CREATE POLICY family_read_college_readiness
ON college_readiness
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_college_readiness ON college_readiness;
CREATE POLICY family_insert_college_readiness
ON college_readiness
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_college_readiness ON college_readiness;
CREATE POLICY family_update_college_readiness
ON college_readiness
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

-- ============================================================
-- Helper Functions
-- ============================================================

-- Function to get academic year from a date
CREATE OR REPLACE FUNCTION get_academic_year(check_date date DEFAULT CURRENT_DATE)
RETURNS text AS $$
DECLARE
  year_start integer;
  year_end integer;
BEGIN
  -- Academic year typically runs from August/September to May/June
  -- For simplicity, we'll use calendar year (can be customized)
  year_start := EXTRACT(YEAR FROM check_date);
  year_end := year_start + 1;
  RETURN year_start || '-' || year_end;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

