-- Assignments System Migration
-- Creates assignments table and RPC functions for managing assignments
-- Safe to run multiple times (IF NOT EXISTS guards)

-- ============================================================
-- 1. Create assignments table
-- ============================================================

CREATE TABLE IF NOT EXISTS assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_by uuid REFERENCES profiles(id),
  related_subject uuid REFERENCES subject(id) ON DELETE SET NULL,
  related_syllabus_unit uuid, -- Can reference syllabus_sections or other units
  due_date date,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'submitted', 'reviewed', 'accepted')),
  linked_event_ids jsonb DEFAULT '[]'::jsonb, -- Array of event UUIDs
  linked_evidence_ids jsonb DEFAULT '[]'::jsonb, -- Array of upload/evidence UUIDs
  need_help boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Indexes for assignments
CREATE INDEX IF NOT EXISTS assignments_family_child_idx ON assignments(family_id, child_id);
CREATE INDEX IF NOT EXISTS assignments_child_status_idx ON assignments(child_id, status);
CREATE INDEX IF NOT EXISTS assignments_due_date_idx ON assignments(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS assignments_status_idx ON assignments(status);
CREATE INDEX IF NOT EXISTS assignments_created_at_idx ON assignments(created_at DESC);

-- Enable RLS
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- RLS policies using existing is_family_member helper
DROP POLICY IF EXISTS family_read_own_assignments ON assignments;
CREATE POLICY family_read_own_assignments
ON assignments
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_assignments ON assignments;
CREATE POLICY family_insert_own_assignments
ON assignments
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_assignments ON assignments;
CREATE POLICY family_update_own_assignments
ON assignments
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_assignments ON assignments;
CREATE POLICY family_delete_own_assignments
ON assignments
FOR DELETE
USING (is_family_member(family_id));

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON assignments TO service_role;

-- ============================================================
-- 2. Create RPC Functions
-- ============================================================

-- Function: get_assignments(child_id)
CREATE OR REPLACE FUNCTION get_assignments(p_child_id uuid)
RETURNS TABLE (
  id uuid,
  family_id uuid,
  child_id uuid,
  title text,
  description text,
  assigned_by uuid,
  assigned_by_name text,
  related_subject uuid,
  related_subject_name text,
  related_syllabus_unit uuid,
  due_date date,
  status text,
  linked_event_ids jsonb,
  linked_evidence_ids jsonb,
  need_help boolean,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_family_id uuid;
  v_child_family_id uuid;
BEGIN
  -- Get user's family_id
  SELECT family_id INTO v_user_family_id
  FROM profiles
  WHERE id = auth.uid()
  LIMIT 1;
  
  -- Verify user has a family
  IF v_user_family_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get child's family_id
  SELECT family_id INTO v_child_family_id
  FROM children
  WHERE id = p_child_id
  LIMIT 1;
  
  -- Verify child belongs to user's family
  IF v_child_family_id IS NULL OR v_child_family_id != v_user_family_id THEN
    RETURN;
  END IF;
  
  -- Return assignments with joined data
  RETURN QUERY
  SELECT 
    a.id,
    a.family_id,
    a.child_id,
    a.title,
    a.description,
    a.assigned_by,
    p.name AS assigned_by_name,
    a.related_subject,
    s.name AS related_subject_name,
    a.related_syllabus_unit,
    a.due_date,
    a.status,
    a.linked_event_ids,
    a.linked_evidence_ids,
    a.need_help,
    a.created_at,
    a.updated_at,
    a.created_by
  FROM assignments a
  LEFT JOIN profiles p ON p.id = a.assigned_by
  LEFT JOIN subject s ON s.id = a.related_subject
  WHERE a.child_id = p_child_id
  ORDER BY 
    CASE 
      WHEN a.due_date IS NOT NULL THEN 0
      ELSE 1
    END,
    a.due_date ASC NULLS LAST,
    a.created_at DESC;
END;
$$;

-- Function: submit_assignment(id, evidence_id, notes)
CREATE OR REPLACE FUNCTION submit_assignment(
  p_assignment_id uuid,
  p_evidence_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment assignments%ROWTYPE;
  v_user_family_id uuid;
  v_current_evidence_ids jsonb;
BEGIN
  -- Get assignment
  SELECT * INTO v_assignment
  FROM assignments
  WHERE id = p_assignment_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assignment not found');
  END IF;
  
  -- Get user's family_id
  SELECT family_id INTO v_user_family_id
  FROM profiles
  WHERE id = auth.uid()
  LIMIT 1;
  
  -- Verify user has access to this assignment's family
  IF v_user_family_id IS NULL OR v_user_family_id != v_assignment.family_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Get current evidence IDs
  v_current_evidence_ids := COALESCE(v_assignment.linked_evidence_ids, '[]'::jsonb);
  
  -- Add evidence_id if provided and not already in array
  IF p_evidence_id IS NOT NULL THEN
    IF NOT (v_current_evidence_ids @> jsonb_build_array(p_evidence_id::text)) THEN
      v_current_evidence_ids := v_current_evidence_ids || jsonb_build_array(p_evidence_id::text);
    END IF;
  END IF;
  
  -- Update assignment status and evidence
  UPDATE assignments
  SET 
    status = 'submitted',
    linked_evidence_ids = v_current_evidence_ids,
    updated_at = now()
  WHERE id = p_assignment_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', p_assignment_id,
    'status', 'submitted'
  );
END;
$$;

-- Function: review_assignment(id, rating, feedback, accepted_bool)
CREATE OR REPLACE FUNCTION review_assignment(
  p_assignment_id uuid,
  p_rating integer DEFAULT NULL,
  p_feedback text DEFAULT NULL,
  p_accepted boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment assignments%ROWTYPE;
  v_user_family_id uuid;
  v_new_status text;
BEGIN
  -- Get assignment
  SELECT * INTO v_assignment
  FROM assignments
  WHERE id = p_assignment_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assignment not found');
  END IF;
  
  -- Get user's family_id
  SELECT family_id INTO v_user_family_id
  FROM profiles
  WHERE id = auth.uid()
  LIMIT 1;
  
  -- Verify user has access to this assignment's family
  IF v_user_family_id IS NULL OR v_user_family_id != v_assignment.family_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Determine new status
  IF p_accepted THEN
    v_new_status := 'accepted';
  ELSE
    v_new_status := 'reviewed';
  END IF;
  
  -- Update assignment status
  UPDATE assignments
  SET 
    status = v_new_status,
    updated_at = now()
  WHERE id = p_assignment_id;
  
  -- Note: rating and feedback could be stored in a separate assignment_reviews table
  -- For now, we'll just update the status
  
  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', p_assignment_id,
    'status', v_new_status
  );
END;
$$;

-- Function: toggle_need_help(id)
CREATE OR REPLACE FUNCTION toggle_need_help(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment assignments%ROWTYPE;
  v_user_family_id uuid;
  v_new_need_help boolean;
BEGIN
  -- Get assignment
  SELECT * INTO v_assignment
  FROM assignments
  WHERE id = p_assignment_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assignment not found');
  END IF;
  
  -- Get user's family_id
  SELECT family_id INTO v_user_family_id
  FROM profiles
  WHERE id = auth.uid()
  LIMIT 1;
  
  -- Verify user has access to this assignment's family
  IF v_user_family_id IS NULL OR v_user_family_id != v_assignment.family_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Toggle need_help
  v_new_need_help := NOT COALESCE(v_assignment.need_help, false);
  
  -- Update assignment
  UPDATE assignments
  SET 
    need_help = v_new_need_help,
    updated_at = now()
  WHERE id = p_assignment_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', p_assignment_id,
    'need_help', v_new_need_help
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_assignments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_assignments(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION submit_assignment(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_assignment(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION review_assignment(uuid, integer, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION review_assignment(uuid, integer, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION toggle_need_help(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_need_help(uuid) TO service_role;

-- Add comments
COMMENT ON TABLE assignments IS 'Assignments connect planner events, evidence, logs, and child mode';
COMMENT ON COLUMN assignments.linked_event_ids IS 'JSONB array of event UUIDs linked to this assignment';
COMMENT ON COLUMN assignments.linked_evidence_ids IS 'JSONB array of evidence/upload UUIDs linked to this assignment';
COMMENT ON COLUMN assignments.status IS 'Assignment status: not_started, in_progress, submitted, reviewed, accepted';

