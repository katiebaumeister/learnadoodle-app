-- Attendance, Compliance, and Transcript Enhancements Migration
-- Adds check-in/out, manual attendance, state requirements toggles, transcript enhancements, and portfolio requirements

-- ============================================================================
-- 1. CHECK-IN/OUT TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS check_in_out (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  check_in_time timestamptz NOT NULL,
  check_out_time timestamptz,
  day_date date NOT NULL,
  total_minutes integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS check_in_out_family_date_idx ON check_in_out(family_id, day_date);
CREATE INDEX IF NOT EXISTS check_in_out_child_date_idx ON check_in_out(child_id, day_date);
CREATE INDEX IF NOT EXISTS check_in_out_day_date_idx ON check_in_out(day_date);

ALTER TABLE check_in_out ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_check_in_out ON check_in_out;
CREATE POLICY family_read_own_check_in_out ON check_in_out
  FOR SELECT USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_check_in_out ON check_in_out;
CREATE POLICY family_insert_own_check_in_out ON check_in_out
  FOR INSERT WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_check_in_out ON check_in_out;
CREATE POLICY family_update_own_check_in_out ON check_in_out
  FOR UPDATE USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_check_in_out ON check_in_out;
CREATE POLICY family_delete_own_check_in_out ON check_in_out
  FOR DELETE USING (is_family_member(family_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON check_in_out TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON check_in_out TO service_role;

-- ============================================================================
-- 2. MANUAL ATTENDANCE RECORDS (Day/Hour Based)
-- ============================================================================
CREATE TABLE IF NOT EXISTS manual_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  attendance_type text NOT NULL CHECK (attendance_type IN ('day', 'hours', 'minutes')),
  -- For 'day' type: value = 1 (present) or 0 (absent)
  -- For 'hours' type: value = number of hours
  -- For 'minutes' type: value = number of minutes
  value numeric NOT NULL,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'partial', 'absent')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS manual_attendance_child_date_type_idx 
ON manual_attendance(child_id, day_date, attendance_type);

CREATE INDEX IF NOT EXISTS manual_attendance_family_date_idx ON manual_attendance(family_id, day_date);
CREATE INDEX IF NOT EXISTS manual_attendance_child_date_idx ON manual_attendance(child_id, day_date);

ALTER TABLE manual_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_manual_attendance ON manual_attendance;
CREATE POLICY family_read_own_manual_attendance ON manual_attendance
  FOR SELECT USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_manual_attendance ON manual_attendance;
CREATE POLICY family_insert_own_manual_attendance ON manual_attendance
  FOR INSERT WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_manual_attendance ON manual_attendance;
CREATE POLICY family_update_own_manual_attendance ON manual_attendance
  FOR UPDATE USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_manual_attendance ON manual_attendance;
CREATE POLICY family_delete_own_manual_attendance ON manual_attendance
  FOR DELETE USING (is_family_member(family_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON manual_attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON manual_attendance TO service_role;

-- ============================================================================
-- 3. STATE REQUIREMENTS SETTINGS (Days vs Hours Toggle)
-- ============================================================================
CREATE TABLE IF NOT EXISTS state_attendance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  state_code text NOT NULL,
  tracking_method text NOT NULL DEFAULT 'hours' CHECK (tracking_method IN ('days', 'hours')),
  -- Minimum requirements based on tracking method
  minimum_days integer, -- For 'days' tracking
  minimum_hours integer, -- For 'hours' tracking
  academic_year_start date,
  academic_year_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  UNIQUE (child_id, state_code)
);

CREATE INDEX IF NOT EXISTS state_attendance_settings_family_idx ON state_attendance_settings(family_id);
CREATE INDEX IF NOT EXISTS state_attendance_settings_child_idx ON state_attendance_settings(child_id);
CREATE INDEX IF NOT EXISTS state_attendance_settings_state_idx ON state_attendance_settings(state_code);

ALTER TABLE state_attendance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_state_attendance_settings ON state_attendance_settings;
CREATE POLICY family_read_own_state_attendance_settings ON state_attendance_settings
  FOR SELECT USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_state_attendance_settings ON state_attendance_settings;
CREATE POLICY family_insert_own_state_attendance_settings ON state_attendance_settings
  FOR INSERT WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_state_attendance_settings ON state_attendance_settings;
CREATE POLICY family_update_own_state_attendance_settings ON state_attendance_settings
  FOR UPDATE USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_state_attendance_settings ON state_attendance_settings;
CREATE POLICY family_delete_own_state_attendance_settings ON state_attendance_settings
  FOR DELETE USING (is_family_member(family_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON state_attendance_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON state_attendance_settings TO service_role;

-- ============================================================================
-- 4. PORTFOLIO REQUIREMENTS (Per State)
-- ============================================================================
CREATE TABLE IF NOT EXISTS portfolio_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL,
  requirement_type text NOT NULL CHECK (requirement_type IN ('samples', 'subjects', 'frequency', 'format')),
  requirement_title text NOT NULL,
  requirement_description text,
  grade_levels text[], -- e.g., ['K', '1', '2', '3-5', '6-8', '9-12']
  is_required boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portfolio_requirements_state_idx ON portfolio_requirements(state_code);
CREATE INDEX IF NOT EXISTS portfolio_requirements_type_idx ON portfolio_requirements(requirement_type);

-- Public read access (reference data)
GRANT SELECT ON portfolio_requirements TO authenticated;
GRANT SELECT ON portfolio_requirements TO anon;

-- Family portfolio tracking
CREATE TABLE IF NOT EXISTS family_portfolio_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  requirement_id uuid REFERENCES portfolio_requirements(id) ON DELETE SET NULL,
  state_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'not_applicable')),
  evidence_count integer DEFAULT 0,
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS family_portfolio_tracking_family_idx ON family_portfolio_tracking(family_id);
CREATE INDEX IF NOT EXISTS family_portfolio_tracking_child_idx ON family_portfolio_tracking(child_id);
CREATE INDEX IF NOT EXISTS family_portfolio_tracking_state_idx ON family_portfolio_tracking(state_code);

ALTER TABLE family_portfolio_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_portfolio_tracking ON family_portfolio_tracking;
CREATE POLICY family_read_own_portfolio_tracking ON family_portfolio_tracking
  FOR SELECT USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_portfolio_tracking ON family_portfolio_tracking;
CREATE POLICY family_insert_own_portfolio_tracking ON family_portfolio_tracking
  FOR INSERT WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_portfolio_tracking ON family_portfolio_tracking;
CREATE POLICY family_update_own_portfolio_tracking ON family_portfolio_tracking
  FOR UPDATE USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_portfolio_tracking ON family_portfolio_tracking;
CREATE POLICY family_delete_own_portfolio_tracking ON family_portfolio_tracking
  FOR DELETE USING (is_family_member(family_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON family_portfolio_tracking TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON family_portfolio_tracking TO service_role;

-- ============================================================================
-- 5. TRANSCRIPT ENHANCEMENTS
-- ============================================================================
-- Add columns to grades table for transcript enhancements
DO $$
BEGIN
  -- Add course_rigor_notes column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'grades' AND column_name = 'course_rigor_notes'
  ) THEN
    ALTER TABLE grades ADD COLUMN course_rigor_notes text;
  END IF;

  -- Add syllabus_attachment_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'grades' AND column_name = 'syllabus_attachment_id'
  ) THEN
    ALTER TABLE grades ADD COLUMN syllabus_attachment_id uuid REFERENCES uploads(id) ON DELETE SET NULL;
  END IF;

  -- Add gpa_type column (weighted/unweighted)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'grades' AND column_name = 'gpa_type'
  ) THEN
    ALTER TABLE grades ADD COLUMN gpa_type text CHECK (gpa_type IN ('weighted', 'unweighted')) DEFAULT 'unweighted';
  END IF;

  -- Add weight_multiplier for weighted GPA calculations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'grades' AND column_name = 'weight_multiplier'
  ) THEN
    ALTER TABLE grades ADD COLUMN weight_multiplier numeric DEFAULT 1.0 CHECK (weight_multiplier >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS grades_syllabus_attachment_idx ON grades(syllabus_attachment_id) WHERE syllabus_attachment_id IS NOT NULL;

-- Add transcript settings table for GPA calculation preferences
CREATE TABLE IF NOT EXISTS transcript_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  default_gpa_type text NOT NULL DEFAULT 'unweighted' CHECK (default_gpa_type IN ('weighted', 'unweighted')),
  include_course_rigor boolean DEFAULT true,
  include_syllabi boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  UNIQUE (child_id)
);

CREATE INDEX IF NOT EXISTS transcript_settings_family_idx ON transcript_settings(family_id);
CREATE INDEX IF NOT EXISTS transcript_settings_child_idx ON transcript_settings(child_id);

ALTER TABLE transcript_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_transcript_settings ON transcript_settings;
CREATE POLICY family_read_own_transcript_settings ON transcript_settings
  FOR SELECT USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_transcript_settings ON transcript_settings;
CREATE POLICY family_insert_own_transcript_settings ON transcript_settings
  FOR INSERT WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_transcript_settings ON transcript_settings;
CREATE POLICY family_update_own_transcript_settings ON transcript_settings
  FOR UPDATE USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_transcript_settings ON transcript_settings;
CREATE POLICY family_delete_own_transcript_settings ON transcript_settings
  FOR DELETE USING (is_family_member(family_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON transcript_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON transcript_settings TO service_role;

-- ============================================================================
-- 6. ATTENDANCE REPORTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS attendance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly', 'yearly', 'custom')),
  date_range_start date NOT NULL,
  date_range_end date NOT NULL,
  format text NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf', 'csv', 'html')),
  file_path text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS attendance_reports_family_idx ON attendance_reports(family_id);
CREATE INDEX IF NOT EXISTS attendance_reports_child_idx ON attendance_reports(child_id);
CREATE INDEX IF NOT EXISTS attendance_reports_date_range_idx ON attendance_reports(date_range_start, date_range_end);

ALTER TABLE attendance_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_attendance_reports ON attendance_reports;
CREATE POLICY family_read_own_attendance_reports ON attendance_reports
  FOR SELECT USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_attendance_reports ON attendance_reports;
CREATE POLICY family_insert_own_attendance_reports ON attendance_reports
  FOR INSERT WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_attendance_reports ON attendance_reports;
CREATE POLICY family_delete_own_attendance_reports ON attendance_reports
  FOR DELETE USING (is_family_member(family_id));

GRANT SELECT, INSERT, DELETE ON attendance_reports TO authenticated;
GRANT SELECT, INSERT, DELETE ON attendance_reports TO service_role;

-- ============================================================================
-- 7. YEAR-END SUMMARY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS year_end_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  academic_year_start date NOT NULL,
  academic_year_end date NOT NULL,
  summary_type text NOT NULL DEFAULT 'full' CHECK (summary_type IN ('full', 'attendance_only', 'grades_only', 'portfolio_only')),
  file_path text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  UNIQUE (child_id, academic_year_start, academic_year_end, summary_type)
);

CREATE INDEX IF NOT EXISTS year_end_summaries_family_idx ON year_end_summaries(family_id);
CREATE INDEX IF NOT EXISTS year_end_summaries_child_idx ON year_end_summaries(child_id);
CREATE INDEX IF NOT EXISTS year_end_summaries_academic_year_idx ON year_end_summaries(academic_year_start, academic_year_end);

ALTER TABLE year_end_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_year_end_summaries ON year_end_summaries;
CREATE POLICY family_read_own_year_end_summaries ON year_end_summaries
  FOR SELECT USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_year_end_summaries ON year_end_summaries;
CREATE POLICY family_insert_own_year_end_summaries ON year_end_summaries
  FOR INSERT WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_year_end_summaries ON year_end_summaries;
CREATE POLICY family_delete_own_year_end_summaries ON year_end_summaries
  FOR DELETE USING (is_family_member(family_id));

GRANT SELECT, INSERT, DELETE ON year_end_summaries TO authenticated;
GRANT SELECT, INSERT, DELETE ON year_end_summaries TO service_role;

-- ============================================================================
-- 8. SKILL COVERAGE MAP TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS skill_coverage_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subject(id) ON DELETE SET NULL,
  skill_name text NOT NULL,
  skill_category text, -- e.g., 'reading', 'writing', 'math', 'science'
  coverage_level numeric CHECK (coverage_level >= 0 AND coverage_level <= 100), -- Percentage covered
  mastery_level text CHECK (mastery_level IN ('introduced', 'practicing', 'mastered', 'exceeded')),
  evidence_count integer DEFAULT 0,
  last_assessed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS skill_coverage_map_family_idx ON skill_coverage_map(family_id);
CREATE INDEX IF NOT EXISTS skill_coverage_map_child_idx ON skill_coverage_map(child_id);
CREATE INDEX IF NOT EXISTS skill_coverage_map_subject_idx ON skill_coverage_map(subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS skill_coverage_map_skill_idx ON skill_coverage_map(skill_name);

ALTER TABLE skill_coverage_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_skill_coverage_map ON skill_coverage_map;
CREATE POLICY family_read_own_skill_coverage_map ON skill_coverage_map
  FOR SELECT USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_skill_coverage_map ON skill_coverage_map;
CREATE POLICY family_insert_own_skill_coverage_map ON skill_coverage_map
  FOR INSERT WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_skill_coverage_map ON skill_coverage_map;
CREATE POLICY family_update_own_skill_coverage_map ON skill_coverage_map
  FOR UPDATE USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_skill_coverage_map ON skill_coverage_map;
CREATE POLICY family_delete_own_skill_coverage_map ON skill_coverage_map
  FOR DELETE USING (is_family_member(family_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON skill_coverage_map TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON skill_coverage_map TO service_role;

-- ============================================================================
-- 9. HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate total attendance minutes from all sources
CREATE OR REPLACE FUNCTION calculate_total_attendance_minutes(
  p_child_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_minutes integer := 0;
BEGIN
  -- From event-based attendance_records
  SELECT COALESCE(SUM(minutes), 0) INTO v_total_minutes
  FROM attendance_records
  WHERE child_id = p_child_id
    AND day_date >= p_start_date
    AND day_date <= p_end_date
    AND status IN ('present', 'partial');

  -- Add manual attendance (convert hours/minutes to minutes)
  SELECT COALESCE(SUM(
    CASE 
      WHEN attendance_type = 'hours' THEN value * 60
      WHEN attendance_type = 'minutes' THEN value
      WHEN attendance_type = 'day' THEN value * 480 -- Assume 8 hours per day
      ELSE 0
    END
  ), 0) INTO v_total_minutes
  FROM manual_attendance
  WHERE child_id = p_child_id
    AND day_date >= p_start_date
    AND day_date <= p_end_date
    AND status IN ('present', 'partial');

  -- Add check-in/out minutes
  SELECT COALESCE(SUM(total_minutes), 0) INTO v_total_minutes
  FROM check_in_out
  WHERE child_id = p_child_id
    AND day_date >= p_start_date
    AND day_date <= p_end_date
    AND check_out_time IS NOT NULL;

  RETURN v_total_minutes;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_total_attendance_minutes(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_total_attendance_minutes(uuid, date, date) TO service_role;

-- Function to calculate GPA (weighted or unweighted)
CREATE OR REPLACE FUNCTION calculate_gpa(
  p_child_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_gpa_type text DEFAULT 'unweighted'
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_points numeric := 0;
  v_total_credits numeric := 0;
  v_gpa numeric;
  v_grade_points numeric;
BEGIN
  SELECT 
    COALESCE(SUM(
      CASE 
        WHEN g.grade = 'A+' THEN 4.0
        WHEN g.grade = 'A' THEN 4.0
        WHEN g.grade = 'A-' THEN 3.7
        WHEN g.grade = 'B+' THEN 3.3
        WHEN g.grade = 'B' THEN 3.0
        WHEN g.grade = 'B-' THEN 2.7
        WHEN g.grade = 'C+' THEN 2.3
        WHEN g.grade = 'C' THEN 2.0
        WHEN g.grade = 'C-' THEN 1.7
        WHEN g.grade = 'D+' THEN 1.3
        WHEN g.grade = 'D' THEN 1.0
        WHEN g.grade = 'D-' THEN 0.7
        WHEN g.grade = 'F' THEN 0.0
        ELSE NULL
      END * COALESCE(g.credits, 0) * 
      CASE 
        WHEN p_gpa_type = 'weighted' THEN COALESCE(g.weight_multiplier, 1.0)
        ELSE 1.0
      END
    ), 0),
    COALESCE(SUM(COALESCE(g.credits, 0)), 0)
  INTO v_total_points, v_total_credits
  FROM grades g
  WHERE g.child_id = p_child_id
    AND g.grade IS NOT NULL
    AND (p_start_date IS NULL OR DATE(g.created_at) >= p_start_date)
    AND (p_end_date IS NULL OR DATE(g.created_at) <= p_end_date);

  IF v_total_credits > 0 THEN
    v_gpa := v_total_points / v_total_credits;
  ELSE
    v_gpa := NULL;
  END IF;

  RETURN ROUND(v_gpa, 2);
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_gpa(uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_gpa(uuid, date, date, text) TO service_role;

-- ============================================================================
-- 10. COMMENTS
-- ============================================================================
COMMENT ON TABLE check_in_out IS 'Manual check-in/out records for attendance tracking';
COMMENT ON TABLE manual_attendance IS 'Manual day/hour-based attendance records (independent of events)';
COMMENT ON TABLE state_attendance_settings IS 'State-specific attendance tracking settings (days vs hours)';
COMMENT ON TABLE portfolio_requirements IS 'State-specific portfolio requirements reference data';
COMMENT ON TABLE family_portfolio_tracking IS 'Family-specific portfolio requirement tracking';
COMMENT ON TABLE transcript_settings IS 'Transcript generation settings (GPA type, rigor notes, syllabi)';
COMMENT ON TABLE attendance_reports IS 'Generated attendance reports (PDF, CSV, HTML)';
COMMENT ON TABLE year_end_summaries IS 'Year-end summary PDFs';
COMMENT ON TABLE skill_coverage_map IS 'Skill coverage visualization data';

