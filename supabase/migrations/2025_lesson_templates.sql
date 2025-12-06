-- Lesson Templates Engine Migration
-- Creates table for repeatable lesson structures with autofill

-- ============================================================================
-- 1. Lesson Templates Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS lesson_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject_id UUID REFERENCES subject(id) ON DELETE SET NULL,
  default_objectives TEXT,
  default_materials TEXT,
  default_steps TEXT,
  default_duration INT, -- minutes
  default_rich_text JSONB DEFAULT '{}'::jsonb,
  linked_standards JSONB DEFAULT '[]'::jsonb, -- array of standard IDs (optional)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================================================
-- 2. Indexes for Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_lesson_templates_family ON lesson_templates(family_id);
CREATE INDEX IF NOT EXISTS idx_lesson_templates_subject ON lesson_templates(subject_id);
CREATE INDEX IF NOT EXISTS idx_lesson_templates_title ON lesson_templates(title);

-- ============================================================================
-- 3. Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE lesson_templates ENABLE ROW LEVEL SECURITY;

-- Lesson templates: Family-scoped
DROP POLICY IF EXISTS "lesson_templates_select" ON lesson_templates;
CREATE POLICY "lesson_templates_select" ON lesson_templates 
  FOR SELECT 
  TO authenticated
  USING (is_family_member(family_id));

DROP POLICY IF EXISTS "lesson_templates_insert" ON lesson_templates;
CREATE POLICY "lesson_templates_insert" ON lesson_templates 
  FOR INSERT 
  TO authenticated
  WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "lesson_templates_update" ON lesson_templates;
CREATE POLICY "lesson_templates_update" ON lesson_templates 
  FOR UPDATE 
  TO authenticated
  USING (is_family_member(family_id))
  WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "lesson_templates_delete" ON lesson_templates;
CREATE POLICY "lesson_templates_delete" ON lesson_templates 
  FOR DELETE 
  TO authenticated
  USING (is_family_member(family_id));

-- ============================================================================
-- 4. Grant Permissions
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON lesson_templates TO authenticated;

-- Service role permissions
GRANT ALL ON lesson_templates TO service_role;

