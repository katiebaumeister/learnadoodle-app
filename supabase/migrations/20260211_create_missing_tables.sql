-- Create missing tables that are causing 404 errors
-- This migration creates: subject_track, grades, event_outcomes, and ensures family_compliance_checklist exists

-- 1. Create subject_track table (if not exists)
CREATE TABLE IF NOT EXISTS subject_track (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subject(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    class_schedule TEXT,
    study_days TEXT,
    travel_minutes INTEGER,
    platform TEXT,
    link TEXT,
    initial_plan TEXT,
    busy_time TEXT,
    roadmap JSONB,
    course_outline_raw TEXT,
    course_outline TEXT,
    status TEXT,
    ai_conversation_history JSONB DEFAULT '[]',
    last_ai_analysis TIMESTAMP WITH TIME ZONE,
    ai_recommendations TEXT,
    unit_start INTEGER DEFAULT 1,
    conversation_history JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for subject_track
CREATE INDEX IF NOT EXISTS idx_subject_track_family_id ON subject_track(family_id);
CREATE INDEX IF NOT EXISTS idx_subject_track_subject_id ON subject_track(subject_id);

-- Enable RLS for subject_track
ALTER TABLE subject_track ENABLE ROW LEVEL SECURITY;

-- RLS policies for subject_track
DROP POLICY IF EXISTS "Users can view family subject tracks" ON subject_track;
CREATE POLICY "Users can view family subject tracks" ON subject_track
    FOR SELECT
    USING (is_family_member(family_id));

DROP POLICY IF EXISTS "Users can update family subject tracks" ON subject_track;
CREATE POLICY "Users can update family subject tracks" ON subject_track
    FOR UPDATE
    USING (is_family_member(family_id))
    WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "Users can insert family subject tracks" ON subject_track;
CREATE POLICY "Users can insert family subject tracks" ON subject_track
    FOR INSERT
    WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "Users can delete family subject tracks" ON subject_track;
CREATE POLICY "Users can delete family subject tracks" ON subject_track
    FOR DELETE
    USING (is_family_member(family_id));

-- 2. Create grades table (if not exists)
CREATE TABLE IF NOT EXISTS grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subject(id),
  assignment_id uuid, -- Optional reference to event/assignment
  term_label text,         -- e.g. "2025–26 Semester 1"
  score numeric,           -- optional numeric score
  grade text,              -- e.g. "A", "B+", "Pass"
  possible numeric,        -- maximum possible score
  rubric text,             -- description of how graded
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Indexes for grades
CREATE INDEX IF NOT EXISTS grades_family_child_idx ON grades(family_id, child_id);
CREATE INDEX IF NOT EXISTS grades_child_subject_idx ON grades(child_id, subject_id);
CREATE INDEX IF NOT EXISTS grades_created_at_idx ON grades(created_at DESC);
CREATE INDEX IF NOT EXISTS grades_assignment_id_idx ON grades(assignment_id) WHERE assignment_id IS NOT NULL;

-- Enable RLS for grades
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;

-- RLS policies for grades
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

-- 3. Create event_outcomes table (if not exists)
CREATE TABLE IF NOT EXISTS event_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subject(id),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rating smallint CHECK (rating >= 1 AND rating <= 5),
  grade text,
  note text,
  strengths text[] DEFAULT '{}',
  struggles text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Add unique constraint to prevent duplicate outcomes per event
CREATE UNIQUE INDEX IF NOT EXISTS event_outcomes_event_unique 
ON event_outcomes(event_id);

-- Indexes for event_outcomes
CREATE INDEX IF NOT EXISTS event_outcomes_family_id_idx ON event_outcomes(family_id);
CREATE INDEX IF NOT EXISTS event_outcomes_child_id_idx ON event_outcomes(child_id);
CREATE INDEX IF NOT EXISTS event_outcomes_event_id_idx ON event_outcomes(event_id);
CREATE INDEX IF NOT EXISTS event_outcomes_subject_id_idx ON event_outcomes(subject_id) WHERE subject_id IS NOT NULL;

-- Enable RLS for event_outcomes
ALTER TABLE event_outcomes ENABLE ROW LEVEL SECURITY;

-- RLS policies for event_outcomes
DROP POLICY IF EXISTS family_read_own_outcomes ON event_outcomes;
CREATE POLICY family_read_own_outcomes
ON event_outcomes
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_outcomes ON event_outcomes;
CREATE POLICY family_insert_own_outcomes
ON event_outcomes
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_outcomes ON event_outcomes;
CREATE POLICY family_update_own_outcomes
ON event_outcomes
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_outcomes ON event_outcomes;
CREATE POLICY family_delete_own_outcomes
ON event_outcomes
FOR DELETE
USING (is_family_member(family_id));

-- 4. Ensure family_compliance_checklist exists (create if not exists)
CREATE TABLE IF NOT EXISTS family_compliance_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id) ON DELETE CASCADE, -- NULL means family-level requirement
  state_code text NOT NULL,
  requirement_id uuid, -- Optional reference to state_requirements if that table exists
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

-- Indexes for family_compliance_checklist
CREATE INDEX IF NOT EXISTS family_compliance_family_id_idx ON family_compliance_checklist(family_id);
CREATE INDEX IF NOT EXISTS family_compliance_child_id_idx ON family_compliance_checklist(child_id);
CREATE INDEX IF NOT EXISTS family_compliance_state_idx ON family_compliance_checklist(state_code);
CREATE INDEX IF NOT EXISTS family_compliance_status_idx ON family_compliance_checklist(status);

-- Enable RLS for family_compliance_checklist
ALTER TABLE family_compliance_checklist ENABLE ROW LEVEL SECURITY;

-- RLS policies for family_compliance_checklist
DROP POLICY IF EXISTS "Family members can view compliance checklist" ON family_compliance_checklist;
CREATE POLICY "Family members can view compliance checklist" ON family_compliance_checklist
  FOR SELECT
  TO authenticated
  USING (is_family_member(family_id));

DROP POLICY IF EXISTS "Family members can insert compliance checklist" ON family_compliance_checklist;
CREATE POLICY "Family members can insert compliance checklist" ON family_compliance_checklist
  FOR INSERT
  TO authenticated
  WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "Family members can update compliance checklist" ON family_compliance_checklist;
CREATE POLICY "Family members can update compliance checklist" ON family_compliance_checklist
  FOR UPDATE
  TO authenticated
  USING (is_family_member(family_id))
  WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS "Family members can delete compliance checklist" ON family_compliance_checklist;
CREATE POLICY "Family members can delete compliance checklist" ON family_compliance_checklist
  FOR DELETE
  TO authenticated
  USING (is_family_member(family_id));

-- Ensure is_family_member function exists (required for RLS policies)
CREATE OR REPLACE FUNCTION public.is_family_member(_family uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM family_members fm
    WHERE fm.family_id = _family
      AND fm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.family_id = _family
  );
$$;

-- Grant permissions to authenticated users (required for RLS to work)
GRANT SELECT, INSERT, UPDATE, DELETE ON subject_track TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON grades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON event_outcomes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON family_compliance_checklist TO authenticated;

-- Grant permissions to service_role for backend operations
GRANT SELECT, INSERT, UPDATE, DELETE ON subject_track TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON grades TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON event_outcomes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON family_compliance_checklist TO service_role;
