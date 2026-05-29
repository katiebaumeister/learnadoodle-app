-- Lightweight assignments RPC for home right rail.
-- Returns only fields needed by child rail and caps row count.
CREATE FUNCTION public.get_assignments_rail(
  p_child_id uuid,
  p_limit integer DEFAULT 120
)
RETURNS TABLE (
  id uuid,
  child_id uuid,
  title text,
  due_date date,
  status text,
  review_status text,
  review_feedback text,
  reviewed_at timestamptz,
  linked_event_ids jsonb,
  need_help boolean,
  help_message_log jsonb,
  assigned_by uuid,
  submitted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_child_family_id uuid;
  v_limit integer;
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

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 120), 20), 300);

  RETURN QUERY
  SELECT
    a.id,
    a.child_id,
    a.title,
    a.due_date,
    a.status,
    a.review_status,
    a.review_feedback,
    a.reviewed_at,
    a.linked_event_ids,
    a.need_help,
    a.help_message_log,
    a.assigned_by,
    a.submitted_at,
    a.created_at,
    a.updated_at
  FROM public.assignments a
  WHERE a.child_id = p_child_id
  ORDER BY
    COALESCE(a.updated_at, a.created_at) DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assignments_rail(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_assignments_rail(uuid, integer) TO service_role;
