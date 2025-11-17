-- ============================================================
-- Flexible Tasks & Syllabus System Migration
-- ============================================================

-- 1. Flexible Tasks: Add columns to events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_flexible BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS estimated_minutes INT CHECK (estimated_minutes >= 0),
  ADD COLUMN IF NOT EXISTS due_ts TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_start_ts TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_end_ts TIMESTAMPTZ;

-- Create backlog_items table
CREATE TABLE IF NOT EXISTS backlog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subject(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  notes TEXT,
  estimated_minutes INT CHECK (estimated_minutes >= 0),
  due_ts TIMESTAMPTZ,
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backlog_items_family ON backlog_items(family_id);
CREATE INDEX IF NOT EXISTS idx_backlog_items_child ON backlog_items(child_id);
CREATE INDEX IF NOT EXISTS idx_backlog_items_due ON backlog_items(due_ts) WHERE due_ts IS NOT NULL;

-- 2. Document stats + richer uploads
DO $$ 
BEGIN
  CREATE TYPE file_kind AS ENUM ('image','pdf','doc','video','audio','other','syllabus');
EXCEPTION WHEN duplicate_object THEN NULL; 
END $$;

ALTER TABLE uploads
  ADD COLUMN IF NOT EXISTS kind file_kind,
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subject(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS child_id UUID REFERENCES children(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_uploads_kind ON uploads(kind);
CREATE INDEX IF NOT EXISTS idx_uploads_subject ON uploads(subject_id);
CREATE INDEX IF NOT EXISTS idx_uploads_child ON uploads(child_id);

-- Upload stats view
CREATE OR REPLACE VIEW v_upload_stats AS
SELECT
  u.family_id,
  u.child_id,
  u.subject_id,
  DATE_TRUNC('month', u.created_at) AS month,
  COUNT(*) AS file_count,
  SUM(u.bytes) AS total_bytes
FROM uploads u
GROUP BY u.family_id, u.child_id, u.subject_id, DATE_TRUNC('month', u.created_at);

-- Subject document targets
CREATE TABLE IF NOT EXISTS subject_doc_targets (
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  monthly_target_files INT DEFAULT 4,
  PRIMARY KEY (family_id, subject_id)
);

-- 3. Syllabus model + linking to events
CREATE TABLE IF NOT EXISTS syllabi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  expected_total_minutes INT,
  expected_weekly_minutes INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_syllabi_family ON syllabi(family_id);
CREATE INDEX IF NOT EXISTS idx_syllabi_child ON syllabi(child_id);
CREATE INDEX IF NOT EXISTS idx_syllabi_subject ON syllabi(subject_id);

-- Parsed outline from AI
CREATE TABLE IF NOT EXISTS syllabus_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  syllabus_id UUID NOT NULL REFERENCES syllabi(id) ON DELETE CASCADE,
  position INT NOT NULL,
  section_type TEXT CHECK (section_type IN ('unit','lesson','assignment')),
  heading TEXT,
  notes TEXT,
  estimated_minutes INT,
  suggested_due_ts TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_syllabus_sections_syllabus ON syllabus_sections(syllabus_id);
CREATE INDEX IF NOT EXISTS idx_syllabus_sections_position ON syllabus_sections(syllabus_id, position);

-- Suggestions generated from a syllabus
CREATE TABLE IF NOT EXISTS plan_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  source_syllabus_id UUID REFERENCES syllabi(id) ON DELETE CASCADE,
  source_section_id UUID REFERENCES syllabus_sections(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  estimated_minutes INT,
  due_ts TIMESTAMPTZ,
  target_day DATE,
  is_flexible BOOLEAN DEFAULT true NOT NULL,
  status TEXT DEFAULT 'suggested' CHECK (status IN ('suggested','accepted','dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_suggestions_family ON plan_suggestions(family_id);
CREATE INDEX IF NOT EXISTS idx_plan_suggestions_child ON plan_suggestions(child_id);
CREATE INDEX IF NOT EXISTS idx_plan_suggestions_status ON plan_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_plan_suggestions_syllabus ON plan_suggestions(source_syllabus_id);

-- Link events to syllabus context
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS source_syllabus_id UUID REFERENCES syllabi(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_section_id UUID REFERENCES syllabus_sections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_events_source_syllabus ON events(source_syllabus_id);
CREATE INDEX IF NOT EXISTS idx_events_source_section ON events(source_section_id);

-- 4. Year planning
CREATE TABLE IF NOT EXISTS school_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_school_years_family ON school_years(family_id);
CREATE INDEX IF NOT EXISTS idx_school_years_dates ON school_years(family_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS year_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  school_year_id UUID NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  plan_expected_weekly_minutes INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_year_subjects_year ON year_subjects(school_year_id);
CREATE INDEX IF NOT EXISTS idx_year_subjects_child ON year_subjects(child_id);

-- ============================================================
-- RLS Policies
-- ============================================================

-- backlog_items RLS
ALTER TABLE backlog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY backlog_items_select ON backlog_items
  FOR SELECT USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY backlog_items_insert ON backlog_items
  FOR INSERT WITH CHECK (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY backlog_items_update ON backlog_items
  FOR UPDATE USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY backlog_items_delete ON backlog_items
  FOR DELETE USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

-- subject_doc_targets RLS
ALTER TABLE subject_doc_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY subject_doc_targets_select ON subject_doc_targets
  FOR SELECT USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY subject_doc_targets_all ON subject_doc_targets
  FOR ALL USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

-- syllabi RLS
ALTER TABLE syllabi ENABLE ROW LEVEL SECURITY;

CREATE POLICY syllabi_select ON syllabi
  FOR SELECT USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY syllabi_all ON syllabi
  FOR ALL USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

-- syllabus_sections RLS
ALTER TABLE syllabus_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY syllabus_sections_select ON syllabus_sections
  FOR SELECT USING (
    syllabus_id IN (SELECT id FROM syllabi WHERE family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid()))
  );

CREATE POLICY syllabus_sections_all ON syllabus_sections
  FOR ALL USING (
    syllabus_id IN (SELECT id FROM syllabi WHERE family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid()))
  );

-- plan_suggestions RLS
ALTER TABLE plan_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_suggestions_select ON plan_suggestions
  FOR SELECT USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY plan_suggestions_all ON plan_suggestions
  FOR ALL USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

-- school_years RLS
ALTER TABLE school_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_years_select ON school_years
  FOR SELECT USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY school_years_all ON school_years
  FOR ALL USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

-- year_subjects RLS
ALTER TABLE year_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY year_subjects_select ON year_subjects
  FOR SELECT USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY year_subjects_all ON year_subjects
  FOR ALL USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

-- Update uploads RLS to include new columns
-- (assuming uploads already has RLS, we just ensure it works with new columns)

