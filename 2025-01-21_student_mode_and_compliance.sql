-- Student Mode & Compliance Features
-- This migration adds:
-- 1. Student settings table for parent controls
-- 2. Reflection prompts system
-- 3. State requirements templates
-- 4. Compliance readiness tracking
-- 5. Content attachment to events
-- 6. Template & sharing system

-- ============================================================================
-- 1. STUDENT SETTINGS (Parent Controls)
-- ============================================================================

CREATE TABLE IF NOT EXISTS student_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  -- Visibility controls
  can_see_grades boolean DEFAULT false,
  can_see_upcoming_plans boolean DEFAULT true,
  can_see_transcripts boolean DEFAULT false,
  can_see_portfolio boolean DEFAULT true,
  -- Access controls
  login_allowed boolean DEFAULT true,
  login_start_time time DEFAULT '06:00:00',
  login_end_time time DEFAULT '22:00:00',
  -- Notification controls
  notifications_enabled boolean DEFAULT true,
  notification_quiet_start time DEFAULT '20:00:00',
  notification_quiet_end time DEFAULT '08:00:00',
  -- Reflection settings
  reflection_prompts_enabled boolean DEFAULT true,
  reflection_frequency text DEFAULT 'daily' CHECK (reflection_frequency IN ('daily', 'weekly', 'after_event')),
  -- Created/updated tracking
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  UNIQUE (child_id)
);

CREATE INDEX IF NOT EXISTS student_settings_family_id_idx ON student_settings(family_id);
CREATE INDEX IF NOT EXISTS student_settings_child_id_idx ON student_settings(child_id);

ALTER TABLE student_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Parents can view student settings" ON student_settings;
CREATE POLICY "Parents can view student settings" ON student_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = student_settings.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = student_settings.family_id
        AND (p.role = 'parent' OR p.role IS NULL)
    )
  );

DROP POLICY IF EXISTS "Students can view own settings" ON student_settings;
CREATE POLICY "Students can view own settings" ON student_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = student_settings.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'child'
        AND student_settings.child_id = ANY(fm.child_scope)
    )
  );

DROP POLICY IF EXISTS "Parents can manage student settings" ON student_settings;
CREATE POLICY "Parents can manage student settings" ON student_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = student_settings.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = student_settings.family_id
        AND (p.role = 'parent' OR p.role IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = student_settings.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = student_settings.family_id
        AND (p.role = 'parent' OR p.role IS NULL)
    )
  );

-- ============================================================================
-- 2. REFLECTION PROMPTS SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS reflection_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  prompt_text text NOT NULL,
  response_text text,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  -- Metadata
  prompt_type text DEFAULT 'after_event' CHECK (prompt_type IN ('daily', 'weekly', 'after_event', 'custom')),
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  created_by uuid REFERENCES profiles(id),
  responded_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS reflection_prompts_family_id_idx ON reflection_prompts(family_id);
CREATE INDEX IF NOT EXISTS reflection_prompts_child_id_idx ON reflection_prompts(child_id);
CREATE INDEX IF NOT EXISTS reflection_prompts_event_id_idx ON reflection_prompts(event_id);
CREATE INDEX IF NOT EXISTS reflection_prompts_created_at_idx ON reflection_prompts(created_at);

ALTER TABLE reflection_prompts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Family members can view reflection prompts" ON reflection_prompts;
CREATE POLICY "Family members can view reflection prompts" ON reflection_prompts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = reflection_prompts.family_id
        AND fm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = reflection_prompts.family_id
    )
  );

DROP POLICY IF EXISTS "Students can respond to reflection prompts" ON reflection_prompts;
CREATE POLICY "Students can respond to reflection prompts" ON reflection_prompts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = reflection_prompts.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'child'
        AND reflection_prompts.child_id = ANY(fm.child_scope)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = reflection_prompts.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'child'
        AND reflection_prompts.child_id = ANY(fm.child_scope)
    )
  );

DROP POLICY IF EXISTS "Parents can create reflection prompts" ON reflection_prompts;
CREATE POLICY "Parents can create reflection prompts" ON reflection_prompts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = reflection_prompts.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = reflection_prompts.family_id
        AND (p.role = 'parent' OR p.role IS NULL)
    )
  );

-- ============================================================================
-- 3. STATE REQUIREMENTS TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS state_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL, -- e.g., 'CA', 'NY', 'TX'
  state_name text NOT NULL,
  requirement_type text NOT NULL CHECK (requirement_type IN ('attendance', 'portfolio', 'testing', 'notification', 'record_keeping', 'other')),
  requirement_title text NOT NULL,
  requirement_description text,
  -- Common requirements checklist
  is_common boolean DEFAULT true,
  grade_levels text[], -- e.g., ['K', '1', '2', '3-5', '6-8', '9-12']
  -- Metadata
  source_url text,
  last_verified_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS state_requirements_state_code_idx ON state_requirements(state_code);
CREATE INDEX IF NOT EXISTS state_requirements_type_idx ON state_requirements(requirement_type);
CREATE INDEX IF NOT EXISTS state_requirements_common_idx ON state_requirements(is_common);

-- Public read access (no RLS needed - this is reference data)
GRANT SELECT ON state_requirements TO authenticated;
GRANT SELECT ON state_requirements TO anon;

-- ============================================================================
-- 4. FAMILY COMPLIANCE CHECKLIST
-- ============================================================================

CREATE TABLE IF NOT EXISTS family_compliance_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id) ON DELETE CASCADE, -- NULL means family-level requirement
  state_code text NOT NULL,
  requirement_id uuid REFERENCES state_requirements(id),
  -- Status tracking
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'not_applicable')),
  completed_at timestamptz,
  notes text,
  -- Evidence links
  evidence_upload_ids uuid[], -- Links to uploads table
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS family_compliance_family_id_idx ON family_compliance_checklist(family_id);
CREATE INDEX IF NOT EXISTS family_compliance_child_id_idx ON family_compliance_checklist(child_id);
CREATE INDEX IF NOT EXISTS family_compliance_state_idx ON family_compliance_checklist(state_code);
CREATE INDEX IF NOT EXISTS family_compliance_status_idx ON family_compliance_checklist(status);

ALTER TABLE family_compliance_checklist ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Family members can view compliance checklist" ON family_compliance_checklist;
CREATE POLICY "Family members can view compliance checklist" ON family_compliance_checklist
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = family_compliance_checklist.family_id
        AND fm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = family_compliance_checklist.family_id
    )
  );

DROP POLICY IF EXISTS "Parents can manage compliance checklist" ON family_compliance_checklist;
CREATE POLICY "Parents can manage compliance checklist" ON family_compliance_checklist
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = family_compliance_checklist.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = family_compliance_checklist.family_id
        AND (p.role = 'parent' OR p.role IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = family_compliance_checklist.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = family_compliance_checklist.family_id
        AND (p.role = 'parent' OR p.role IS NULL)
    )
  );

-- ============================================================================
-- 5. COMPLIANCE READINESS METRICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW compliance_readiness AS
SELECT 
  c.id AS child_id,
  c.family_id,
  c.first_name AS child_name,
  -- Attendance metrics
  COALESCE((
    SELECT SUM(COALESCE(ar.minutes, 0))
    FROM attendance_records ar
    WHERE ar.child_id = c.id
      AND ar.day_date >= DATE_TRUNC('year', CURRENT_DATE)
  ), 0) AS attendance_minutes_this_year,
  COALESCE((
    SELECT COUNT(DISTINCT ar.day_date)
    FROM attendance_records ar
    WHERE ar.child_id = c.id
      AND ar.day_date >= DATE_TRUNC('year', CURRENT_DATE)
      AND ar.status = 'present'
  ), 0) AS attendance_days_this_year,
  -- Credit tracking by subject
  COALESCE((
    SELECT jsonb_object_agg(subject_name, total_credits)
    FROM (
      SELECT s.name AS subject_name, COALESCE(SUM(g.credits), 0) AS total_credits
      FROM grades g
      JOIN subject s ON s.id = g.subject_id
      WHERE g.child_id = c.id
      GROUP BY s.name
    ) credit_summary
  ), '{}'::jsonb) AS credits_by_subject,
  -- Portfolio evidence count
  COALESCE((
    SELECT COUNT(*)
    FROM uploads u
    WHERE u.child_id = c.id
      AND u.created_at >= DATE_TRUNC('year', CURRENT_DATE)
  ), 0) AS portfolio_artifacts_this_year,
  -- Portfolio evidence by subject
  COALESCE((
    SELECT jsonb_object_agg(subject_name, artifact_count)
    FROM (
      SELECT COALESCE(s.name, 'Unassigned') AS subject_name, COUNT(*) AS artifact_count
      FROM uploads u
      LEFT JOIN subject s ON s.id = u.subject_id
      WHERE u.child_id = c.id
        AND u.created_at >= DATE_TRUNC('year', CURRENT_DATE)
      GROUP BY s.name
    ) portfolio_summary
  ), '{}'::jsonb) AS portfolio_by_subject,
  -- Compliance checklist status
  COALESCE((
    SELECT jsonb_object_agg(
      req.requirement_type || '_' || req.id,
      jsonb_build_object(
        'status', chk.status,
        'completed_at', chk.completed_at
      )
    )
    FROM family_compliance_checklist chk
    JOIN state_requirements req ON req.id = chk.requirement_id
    WHERE chk.child_id = c.id
  ), '{}'::jsonb) AS compliance_status
FROM children c
WHERE c.archived = false;

GRANT SELECT ON compliance_readiness TO authenticated;
GRANT SELECT ON compliance_readiness TO service_role;

COMMENT ON VIEW compliance_readiness IS 'Aggregated compliance readiness metrics per child for dashboard display';

-- ============================================================================
-- 6. EVENT MATERIALS ATTACHMENT
-- ============================================================================

-- Add materials_attachment column to events if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'materials_attachment_ids'
  ) THEN
    ALTER TABLE events ADD COLUMN materials_attachment_ids uuid[] DEFAULT '{}';
  END IF;
END $$;

-- Add resume_position for course continuation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'resume_position'
  ) THEN
    ALTER TABLE events ADD COLUMN resume_position text; -- e.g., "Chapter 3, Lesson 2" or timestamp for videos
  END IF;
END $$;

-- Add source_link for content parsing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'source_link'
  ) THEN
    ALTER TABLE events ADD COLUMN source_link text; -- Original YouTube/course URL
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS events_materials_attachment_idx ON events USING GIN(materials_attachment_ids);

-- ============================================================================
-- 7. TEMPLATE & SHARING SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS plan_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES family(id) ON DELETE CASCADE, -- NULL means public/system template
  created_by uuid REFERENCES profiles(id),
  -- Template metadata
  template_name text NOT NULL,
  template_description text,
  template_type text DEFAULT 'sequence' CHECK (template_type IN ('sequence', 'plan', 'unit', 'lesson')),
  -- Template content (JSONB for flexibility)
  template_data jsonb NOT NULL DEFAULT '{}', -- Contains events, subjects, duration, etc.
  -- Sharing settings
  is_public boolean DEFAULT false,
  is_system_template boolean DEFAULT false, -- System-wide templates
  -- Metadata
  grade_levels text[],
  subjects text[],
  estimated_duration_days integer,
  tags text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_templates_family_id_idx ON plan_templates(family_id);
CREATE INDEX IF NOT EXISTS plan_templates_type_idx ON plan_templates(template_type);
CREATE INDEX IF NOT EXISTS plan_templates_public_idx ON plan_templates(is_public);
CREATE INDEX IF NOT EXISTS plan_templates_system_idx ON plan_templates(is_system_template);
CREATE INDEX IF NOT EXISTS plan_templates_grade_levels_idx ON plan_templates USING GIN(grade_levels);
CREATE INDEX IF NOT EXISTS plan_templates_subjects_idx ON plan_templates USING GIN(subjects);

ALTER TABLE plan_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Anyone can view public templates" ON plan_templates;
CREATE POLICY "Anyone can view public templates" ON plan_templates
  FOR SELECT
  TO authenticated
  USING (
    is_public = true 
    OR is_system_template = true
    OR EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = plan_templates.family_id
        AND fm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = plan_templates.family_id
    )
  );

DROP POLICY IF EXISTS "Family members can create templates" ON plan_templates;
CREATE POLICY "Family members can create templates" ON plan_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    family_id IS NULL -- Public/system templates
    OR EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = plan_templates.family_id
        AND fm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = plan_templates.family_id
    )
  );

DROP POLICY IF EXISTS "Creators can update own templates" ON plan_templates;
CREATE POLICY "Creators can update own templates" ON plan_templates
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = plan_templates.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = plan_templates.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
  );

-- Template usage tracking
CREATE TABLE IF NOT EXISTS template_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES plan_templates(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id) ON DELETE CASCADE,
  used_by uuid REFERENCES profiles(id),
  used_at timestamptz DEFAULT now(),
  -- Customization data
  customization_data jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS template_usage_template_id_idx ON template_usage(template_id);
CREATE INDEX IF NOT EXISTS template_usage_family_id_idx ON template_usage(family_id);

ALTER TABLE template_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Family members can view template usage" ON template_usage;
CREATE POLICY "Family members can view template usage" ON template_usage
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = template_usage.family_id
        AND fm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = template_usage.family_id
    )
  );

-- ============================================================================
-- 8. HELPER FUNCTIONS
-- ============================================================================

-- Function to get default reflection prompts
CREATE OR REPLACE FUNCTION get_default_reflection_prompts()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'How did that go?',
    'What did you learn?',
    'What was challenging?',
    'What would you do differently next time?',
    'Rate how you felt about this activity (1-5)'
  ];
$$;

-- Function to calculate compliance readiness score
CREATE OR REPLACE FUNCTION calculate_compliance_score(_child_id uuid, _state_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  attendance_score numeric;
  portfolio_score numeric;
  checklist_score numeric;
BEGIN
  -- Get attendance score (hours vs typical requirement)
  SELECT 
    CASE 
      WHEN COALESCE(SUM(ar.minutes), 0) >= 900 THEN 1.0 -- 15 hours/month typical minimum
      ELSE LEAST(COALESCE(SUM(ar.minutes), 0) / 900.0, 1.0)
    END
  INTO attendance_score
  FROM attendance_records ar
  WHERE ar.child_id = _child_id
    AND ar.day_date >= DATE_TRUNC('month', CURRENT_DATE)
    AND ar.status = 'present';

  -- Get portfolio score (artifacts count)
  SELECT 
    CASE 
      WHEN COUNT(*) >= 10 THEN 1.0 -- 10 artifacts/month typical
      ELSE LEAST(COUNT(*)::numeric / 10.0, 1.0)
    END
  INTO portfolio_score
  FROM uploads u
  WHERE u.child_id = _child_id
    AND u.created_at >= DATE_TRUNC('month', CURRENT_DATE);

  -- Get checklist completion score
  SELECT 
    CASE 
      WHEN COUNT(*) = 0 THEN 0.0
      ELSE COUNT(*) FILTER (WHERE status = 'completed')::numeric / COUNT(*)::numeric
    END
  INTO checklist_score
  FROM family_compliance_checklist chk
  WHERE chk.child_id = _child_id
    AND chk.state_code = _state_code;

  result := jsonb_build_object(
    'attendance_score', COALESCE(attendance_score, 0.0),
    'portfolio_score', COALESCE(portfolio_score, 0.0),
    'checklist_score', COALESCE(checklist_score, 0.0),
    'overall_score', (
      COALESCE(attendance_score, 0.0) * 0.4 +
      COALESCE(portfolio_score, 0.0) * 0.3 +
      COALESCE(checklist_score, 0.0) * 0.3
    )
  );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_compliance_score(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_default_reflection_prompts() TO authenticated;

-- ============================================================================
-- 9. INITIAL DATA: Common State Requirements
-- ============================================================================

-- Insert common state requirements (these are examples - not legal advice)
INSERT INTO state_requirements (state_code, state_name, requirement_type, requirement_title, requirement_description, is_common, grade_levels) VALUES
-- California
('CA', 'California', 'notification', 'File Private School Affidavit', 'File annual affidavit with state superintendent', true, ARRAY['K', '1', '2', '3-5', '6-8', '9-12']),
('CA', 'California', 'attendance', '180 Days of Instruction', 'Provide instruction for at least 180 days per year', true, ARRAY['K', '1', '2', '3-5', '6-8', '9-12']),
('CA', 'California', 'record_keeping', 'Maintain Attendance Records', 'Keep daily attendance records', true, ARRAY['K', '1', '2', '3-5', '6-8', '9-12']),
-- New York
('NY', 'New York', 'notification', 'File Annual Letter of Intent', 'Submit letter of intent to school district', true, ARRAY['K', '1', '2', '3-5', '6-8', '9-12']),
('NY', 'New York', 'attendance', '180 Days of Instruction', 'Provide instruction for at least 180 days per year', true, ARRAY['K', '1', '2', '3-5', '6-8', '9-12']),
('NY', 'New York', 'testing', 'Annual Assessment', 'Submit annual assessment results (grades 1-8)', true, ARRAY['1', '2', '3-5', '6-8']),
-- Texas
('TX', 'Texas', 'notification', 'No Notification Required', 'Texas does not require notification for homeschooling', true, ARRAY['K', '1', '2', '3-5', '6-8', '9-12']),
('TX', 'Texas', 'attendance', '180 Days of Instruction', 'Provide instruction for at least 180 days per year', true, ARRAY['K', '1', '2', '3-5', '6-8', '9-12']),
-- Generic common requirements
('US', 'United States', 'portfolio', 'Maintain Portfolio', 'Keep portfolio of student work samples', true, ARRAY['K', '1', '2', '3-5', '6-8', '9-12']),
('US', 'United States', 'record_keeping', 'Keep Transcripts', 'Maintain transcripts for high school students', true, ARRAY['9-12'])
ON CONFLICT DO NOTHING;

COMMENT ON TABLE student_settings IS 'Parent-controlled settings for student accounts (visibility, access, notifications)';
COMMENT ON TABLE reflection_prompts IS 'Reflection prompts for students to rate and reflect on learning activities';
COMMENT ON TABLE state_requirements IS 'Reference data for state-specific homeschooling requirements (not legal advice)';
COMMENT ON TABLE family_compliance_checklist IS 'Family-specific compliance checklist tracking against state requirements';
COMMENT ON TABLE plan_templates IS 'Reusable plan templates that can be shared across families';
COMMENT ON TABLE template_usage IS 'Tracks usage of templates by families';

