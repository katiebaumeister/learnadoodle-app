-- Standards Engine Migration
-- Creates tables for standards tracking, mastery, and templates

-- ============================================================================
-- 1. Standards Table (Core standards catalog)
-- ============================================================================
-- Note: The standards table may already exist from 2025-11-19_standards_ai_planning.sql
-- We'll add subject_id column if it doesn't exist to allow linking standards to family subjects
-- This is done early so indexes can reference it later
DO $$ 
BEGIN
  -- Add subject_id column if standards table exists and column doesn't exist
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'standards') THEN
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'standards' AND column_name = 'subject_id') THEN
      ALTER TABLE standards ADD COLUMN subject_id UUID REFERENCES subject(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 2. Standard Templates (Preset lists like "3rd Grade Math Standards")
-- ============================================================================
CREATE TABLE IF NOT EXISTS standard_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject_id UUID REFERENCES subject(id) ON DELETE SET NULL,
  grade_level TEXT,
  standards JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of standard IDs
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. Lesson Standards (Many-to-many: lessons to standards)
-- ============================================================================
CREATE TABLE IF NOT EXISTS lesson_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  standard_id UUID NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lesson_id, standard_id)
);

-- ============================================================================
-- 4. Student Standard Mastery (To enable proficiency bars)
-- ============================================================================
CREATE TABLE IF NOT EXISTS student_standard_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  standard_id UUID NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES events(id) ON DELETE SET NULL,
  evidence_id UUID REFERENCES uploads(id) ON DELETE SET NULL,
  mastery_level TEXT NOT NULL CHECK (mastery_level IN ('mastered', 'developing', 'needs_work', 'not_attempted')),
  score INT CHECK (score >= 0 AND score <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(student_id, standard_id)
);

-- ============================================================================
-- 5. Indexes for Performance
-- ============================================================================
-- Create indexes if the columns exist
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'standards' AND column_name = 'subject_id') THEN
    CREATE INDEX IF NOT EXISTS idx_standards_subject_id ON standards(subject_id);
  END IF;
  IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'standards' AND column_name = 'grade_level') THEN
    CREATE INDEX IF NOT EXISTS idx_standards_grade ON standards(grade_level);
  END IF;
  IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'standards' AND column_name = 'source') THEN
    CREATE INDEX IF NOT EXISTS idx_standards_source ON standards(source);
  END IF;
  -- Use standard_code if it exists, otherwise code
  IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'standards' AND column_name = 'standard_code') THEN
    CREATE INDEX IF NOT EXISTS idx_standards_code ON standards(standard_code);
  ELSIF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'standards' AND column_name = 'code') THEN
    CREATE INDEX IF NOT EXISTS idx_standards_code ON standards(code);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_standard_templates_family ON standard_templates(family_id);
CREATE INDEX IF NOT EXISTS idx_standard_templates_subject ON standard_templates(subject_id);

CREATE INDEX IF NOT EXISTS idx_lesson_standards_lesson ON lesson_standards(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_standards_standard ON lesson_standards(standard_id);

CREATE INDEX IF NOT EXISTS idx_mastery_student ON student_standard_mastery(student_id);
CREATE INDEX IF NOT EXISTS idx_mastery_standard ON student_standard_mastery(standard_id);
CREATE INDEX IF NOT EXISTS idx_mastery_lesson ON student_standard_mastery(lesson_id);
CREATE INDEX IF NOT EXISTS idx_mastery_family ON student_standard_mastery(family_id);
CREATE INDEX IF NOT EXISTS idx_mastery_level ON student_standard_mastery(mastery_level);

-- ============================================================================
-- 6. Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE standard_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_standard_mastery ENABLE ROW LEVEL SECURITY;

-- Standards: Read-only for authenticated users (can be made more restrictive)
DROP POLICY IF EXISTS "standards_select" ON standards;
CREATE POLICY "standards_select" ON standards 
  FOR SELECT 
  TO authenticated 
  USING (true);

-- Standard templates: Family-scoped
DROP POLICY IF EXISTS "standard_templates_select" ON standard_templates;
CREATE POLICY "standard_templates_select" ON standard_templates 
  FOR SELECT 
  TO authenticated
  USING (is_family_member(family_id));

DROP POLICY IF EXISTS "standard_templates_insert" ON standard_templates;
CREATE POLICY "standard_templates_insert" ON standard_templates 
  FOR INSERT 
  TO authenticated
  WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "standard_templates_update" ON standard_templates;
CREATE POLICY "standard_templates_update" ON standard_templates 
  FOR UPDATE 
  TO authenticated
  USING (is_family_member(family_id))
  WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "standard_templates_delete" ON standard_templates;
CREATE POLICY "standard_templates_delete" ON standard_templates 
  FOR DELETE 
  TO authenticated
  USING (is_family_member(family_id));

-- Lesson standards: Family-scoped via events
DROP POLICY IF EXISTS "lesson_standards_select" ON lesson_standards;
CREATE POLICY "lesson_standards_select" ON lesson_standards 
  FOR SELECT 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = lesson_standards.lesson_id
      AND is_family_member(e.family_id)
    )
  );

DROP POLICY IF EXISTS "lesson_standards_insert" ON lesson_standards;
CREATE POLICY "lesson_standards_insert" ON lesson_standards 
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = lesson_standards.lesson_id
      AND is_family_member(e.family_id)
    )
  );

DROP POLICY IF EXISTS "lesson_standards_delete" ON lesson_standards;
CREATE POLICY "lesson_standards_delete" ON lesson_standards 
  FOR DELETE 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = lesson_standards.lesson_id
      AND is_family_member(e.family_id)
    )
  );

-- Student mastery: Family-scoped
DROP POLICY IF EXISTS "mastery_select" ON student_standard_mastery;
CREATE POLICY "mastery_select" ON student_standard_mastery 
  FOR SELECT 
  TO authenticated
  USING (is_family_member(family_id));

DROP POLICY IF EXISTS "mastery_insert" ON student_standard_mastery;
CREATE POLICY "mastery_insert" ON student_standard_mastery 
  FOR INSERT 
  TO authenticated
  WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "mastery_update" ON student_standard_mastery;
CREATE POLICY "mastery_update" ON student_standard_mastery 
  FOR UPDATE 
  TO authenticated
  USING (is_family_member(family_id))
  WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "mastery_delete" ON student_standard_mastery;
CREATE POLICY "mastery_delete" ON student_standard_mastery 
  FOR DELETE 
  TO authenticated
  USING (is_family_member(family_id));

-- ============================================================================
-- 7. Grant Permissions
-- ============================================================================
GRANT SELECT ON standards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON standard_templates TO authenticated;
GRANT SELECT, INSERT, DELETE ON lesson_standards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON student_standard_mastery TO authenticated;

-- Service role permissions
GRANT ALL ON standards TO service_role;
GRANT ALL ON standard_templates TO service_role;
GRANT ALL ON lesson_standards TO service_role;
GRANT ALL ON student_standard_mastery TO service_role;

