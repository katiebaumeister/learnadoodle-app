-- Curriculum AI Wizard System
-- Adds syllabus_skills table and ai_parse_syllabus RPC

-- ============================================================
-- 1. Create syllabus_skills table
-- ============================================================

CREATE TABLE IF NOT EXISTS syllabus_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  syllabus_id uuid NOT NULL REFERENCES syllabi(id) ON DELETE CASCADE,
  section_id uuid REFERENCES syllabus_sections(id) ON DELETE CASCADE,
  skill text NOT NULL,
  difficulty text CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  weight numeric DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 10),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for syllabus_skills
CREATE INDEX IF NOT EXISTS syllabus_skills_syllabus_idx ON syllabus_skills(syllabus_id);
CREATE INDEX IF NOT EXISTS syllabus_skills_section_idx ON syllabus_skills(section_id);
CREATE INDEX IF NOT EXISTS syllabus_skills_skill_idx ON syllabus_skills(skill);

-- Enable RLS
ALTER TABLE syllabus_skills ENABLE ROW LEVEL SECURITY;

-- RLS policies using existing is_family_member helper
DROP POLICY IF EXISTS family_read_own_syllabus_skills ON syllabus_skills;
CREATE POLICY family_read_own_syllabus_skills
ON syllabus_skills
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM syllabi s
    WHERE s.id = syllabus_skills.syllabus_id
      AND is_family_member(s.family_id)
  )
);

DROP POLICY IF EXISTS family_insert_own_syllabus_skills ON syllabus_skills;
CREATE POLICY family_insert_own_syllabus_skills
ON syllabus_skills
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM syllabi s
    WHERE s.id = syllabus_skills.syllabus_id
      AND is_family_member(s.family_id)
  )
);

DROP POLICY IF EXISTS family_update_own_syllabus_skills ON syllabus_skills;
CREATE POLICY family_update_own_syllabus_skills
ON syllabus_skills
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM syllabi s
    WHERE s.id = syllabus_skills.syllabus_id
      AND is_family_member(s.family_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM syllabi s
    WHERE s.id = syllabus_skills.syllabus_id
      AND is_family_member(s.family_id)
  )
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON syllabus_skills TO authenticated;
GRANT SELECT, INSERT, UPDATE ON syllabus_skills TO service_role;

-- ============================================================
-- 2. Create ai_parse_syllabus RPC function
-- ============================================================

CREATE OR REPLACE FUNCTION ai_parse_syllabus(
  p_pdf_url text,
  p_family_id uuid,
  p_child_id uuid,
  p_subject_id uuid,
  p_syllabus_title text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_expected_weekly_minutes int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_syllabus_id uuid;
  v_upload_id uuid;
  v_storage_path text;
  v_file_name text;
  v_parsed_result jsonb;
  v_units jsonb;
  v_sections jsonb;
  v_skills jsonb;
  v_unit_record record;
  v_section_record record;
  v_skill_record record;
BEGIN
  -- Validate inputs
  IF p_pdf_url IS NULL OR p_pdf_url = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'PDF URL is required'
    );
  END IF;

  IF NOT is_family_member(p_family_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized'
    );
  END IF;

  -- Extract storage path from URL (assuming Supabase storage URL format)
  -- URL format: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
  v_storage_path := regexp_replace(p_pdf_url, '^.*/storage/v1/object/public/[^/]+/', '');
  v_file_name := split_part(v_storage_path, '/', -1);

  -- Create upload record if it doesn't exist
  INSERT INTO uploads (
    family_id,
    child_id,
    subject_id,
    filename,
    url,
    storage_path,
    kind,
    mime,
    bytes
  )
  VALUES (
    p_family_id,
    p_child_id,
    p_subject_id,
    v_file_name,
    p_pdf_url,
    v_storage_path,
    'syllabus',
    'application/pdf',
    0
  )
  ON CONFLICT (storage_path) DO UPDATE SET
    family_id = EXCLUDED.family_id,
    child_id = EXCLUDED.child_id,
    subject_id = EXCLUDED.subject_id
  RETURNING id INTO v_upload_id;

  -- Create syllabus record
  INSERT INTO syllabi (
    family_id,
    child_id,
    subject_id,
    upload_id,
    title,
    start_date,
    end_date,
    expected_weekly_minutes
  )
  VALUES (
    p_family_id,
    p_child_id,
    p_subject_id,
    v_upload_id,
    COALESCE(p_syllabus_title, v_file_name),
    p_start_date,
    p_end_date,
    p_expected_weekly_minutes
  )
  RETURNING id INTO v_syllabus_id;

  -- Note: The actual AI parsing will be done by the backend API
  -- This RPC just sets up the database structure
  -- The backend will call this RPC with the parsed results
  
  RETURN jsonb_build_object(
    'success', true,
    'syllabus_id', v_syllabus_id,
    'upload_id', v_upload_id,
    'message', 'Syllabus created. Call backend API to parse PDF content.'
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION ai_parse_syllabus(text, uuid, uuid, uuid, text, date, date, int) TO authenticated;
GRANT EXECUTE ON FUNCTION ai_parse_syllabus(text, uuid, uuid, uuid, text, date, date, int) TO service_role;

-- Add comments
COMMENT ON TABLE syllabus_skills IS 'Skills extracted from syllabus units with difficulty and weight';
COMMENT ON COLUMN syllabus_skills.difficulty IS 'Skill difficulty level: beginner, intermediate, advanced';
COMMENT ON COLUMN syllabus_skills.weight IS 'Importance weight (0-10) for pacing calculations';

