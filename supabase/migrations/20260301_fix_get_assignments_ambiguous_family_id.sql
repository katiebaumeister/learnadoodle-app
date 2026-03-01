-- Fix: column reference "family_id" is ambiguous in get_assignments
-- (assignments and profiles both have family_id; qualify all columns in SELECT)
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
  SELECT p_inner.family_id INTO v_user_family_id
  FROM profiles p_inner
  WHERE p_inner.id = auth.uid()
  LIMIT 1;

  IF v_user_family_id IS NULL THEN
    RETURN;
  END IF;

  SELECT c.family_id INTO v_child_family_id
  FROM children c
  WHERE c.id = p_child_id
  LIMIT 1;

  IF v_child_family_id IS NULL OR v_child_family_id != v_user_family_id THEN
    RETURN;
  END IF;

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
    CASE WHEN a.due_date IS NOT NULL THEN 0 ELSE 1 END,
    a.due_date ASC NULLS LAST,
    a.created_at DESC;
END;
$$;
