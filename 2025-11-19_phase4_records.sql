-- Phase 4: Records, Credits & Compliance
-- Chunk A: Database tables for grades, transcripts, and uploads metadata
-- Safe to run multiple times (IF NOT EXISTS guards)

-- 1) grades table
CREATE TABLE IF NOT EXISTS grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subject(id),
  term_label text,         -- e.g. "2025–26 Semester 1"
  score numeric,           -- optional numeric score
  grade text,              -- e.g. "A", "B+", "Pass"
  rubric text,             -- description of how graded
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Indexes for grades
CREATE INDEX IF NOT EXISTS grades_family_child_idx ON grades(family_id, child_id);
CREATE INDEX IF NOT EXISTS grades_child_subject_idx ON grades(child_id, subject_id);
CREATE INDEX IF NOT EXISTS grades_created_at_idx ON grades(created_at DESC);

-- Enable RLS
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;

-- RLS policies using existing is_family_member helper
DROP POLICY IF EXISTS family_read_own_grades ON grades;
CREATE POLICY family_read_own_grades
ON grades
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_grades ON grades;
CREATE POLICY family_insert_own_grades
ON grades
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_grades ON grades;
CREATE POLICY family_update_own_grades
ON grades
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_grades ON grades;
CREATE POLICY family_delete_own_grades
ON grades
FOR DELETE
USING (is_family_member(family_id));

-- 2) transcripts table
CREATE TABLE IF NOT EXISTS transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  export_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Indexes for transcripts
CREATE INDEX IF NOT EXISTS transcripts_family_child_idx ON transcripts(family_id, child_id);
CREATE INDEX IF NOT EXISTS transcripts_created_at_idx ON transcripts(created_at DESC);

-- Enable RLS
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;

-- RLS policies using existing is_family_member helper
DROP POLICY IF EXISTS family_read_own_transcripts ON transcripts;
CREATE POLICY family_read_own_transcripts
ON transcripts
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_transcripts ON transcripts;
CREATE POLICY family_insert_own_transcripts
ON transcripts
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_transcripts ON transcripts;
CREATE POLICY family_delete_own_transcripts
ON transcripts
FOR DELETE
USING (is_family_member(family_id));

-- 3) uploads table - check if exists and add missing fields if needed
-- Note: uploads table may already exist from previous migrations
-- We'll add caption field if it doesn't exist (for portfolio/evidence)
DO $$
BEGIN
  -- Add caption column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'uploads' AND column_name = 'caption'
  ) THEN
    ALTER TABLE uploads ADD COLUMN caption text;
  END IF;
  
  -- Ensure family_id exists and references family table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'uploads' AND column_name = 'family_id'
  ) THEN
    ALTER TABLE uploads ADD COLUMN family_id uuid REFERENCES family(id) ON DELETE CASCADE;
  END IF;
  
  -- Ensure storage_path exists (required field)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'uploads' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE uploads ADD COLUMN storage_path text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Ensure RLS is enabled on uploads (may already be enabled)
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

-- Ensure RLS policies exist for uploads (may already exist, but ensure they're correct)
DROP POLICY IF EXISTS family_read_own_uploads ON uploads;
CREATE POLICY family_read_own_uploads
ON uploads
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_uploads ON uploads;
CREATE POLICY family_insert_own_uploads
ON uploads
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_uploads ON uploads;
CREATE POLICY family_update_own_uploads
ON uploads
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_uploads ON uploads;
CREATE POLICY family_delete_own_uploads
ON uploads
FOR DELETE
USING (is_family_member(family_id));

-- Grant permissions to service_role for backend operations
GRANT SELECT, INSERT, UPDATE, DELETE ON grades TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON transcripts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON uploads TO service_role;

