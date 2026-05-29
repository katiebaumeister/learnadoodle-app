-- Include review columns directly in get_assignments so clients can load
-- all assignment rail fields in a single RPC call.
DROP FUNCTION IF EXISTS public.get_assignments(uuid);

CREATE FUNCTION public.get_assignments(p_child_id uuid)
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
  review_status text,
  review_feedback text,
  reviewed_at timestamptz,
  linked_event_ids jsonb,
  linked_evidence_ids jsonb,
  need_help boolean,
  help_message_log jsonb,
  help_parent_last_read_at timestamptz,
  help_child_last_read_at timestamptz,
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
  v_child_family_id uuid;
BEGIN
  SELECT c.family_id INTO v_child_family_id
  FROM public.children c
  WHERE c.id = p_child_id
  LIMIT 1;

  IF v_child_family_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.auth_can_access_assignment(v_child_family_id, p_child_id) THEN
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
    a.review_status,
    a.review_feedback,
    a.reviewed_at,
    a.linked_event_ids,
    a.linked_evidence_ids,
    a.need_help,
    a.help_message_log,
    a.help_parent_last_read_at,
    a.help_child_last_read_at,
    a.created_at,
    a.updated_at,
    a.created_by
  FROM public.assignments a
  LEFT JOIN public.profiles p ON p.id = a.assigned_by
  LEFT JOIN public.subject s ON s.id = a.related_subject
  WHERE a.child_id = p_child_id
  ORDER BY
    CASE WHEN a.due_date IS NOT NULL THEN 0 ELSE 1 END,
    a.due_date ASC NULLS LAST,
    a.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assignments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_assignments(uuid) TO service_role;
