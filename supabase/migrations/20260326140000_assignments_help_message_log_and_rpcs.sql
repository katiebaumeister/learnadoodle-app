-- Parent ↔ child help on assignments using existing `assignments` table only:
-- - help_message_log: JSONB array of messages (no new tables).
-- - Read receipts on the same row.
-- - RPCs use SECURITY DEFINER + explicit checks so child logins (family_members.child_scope) work,
--   not only profiles.family_id.

-- ---------------------------------------------------------------------------
-- 1. Columns on assignments
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.assignments') IS NULL THEN
    RAISE NOTICE 'assignments table missing; skipping migration';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'help_message_log'
  ) THEN
    ALTER TABLE public.assignments
      ADD COLUMN help_message_log jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'help_parent_last_read_at'
  ) THEN
    ALTER TABLE public.assignments
      ADD COLUMN help_parent_last_read_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'help_child_last_read_at'
  ) THEN
    ALTER TABLE public.assignments
      ADD COLUMN help_child_last_read_at timestamptz;
  END IF;
END
$$;

COMMENT ON COLUMN public.assignments.help_message_log IS
  'Append-only JSON array of help thread messages: {id, sender_role, author_id, body, reason, created_at}.';

COMMENT ON COLUMN public.assignments.help_parent_last_read_at IS
  'When the parent last opened/read the help thread (for unread UI).';

COMMENT ON COLUMN public.assignments.help_child_last_read_at IS
  'When the learner last opened/read the help thread (for unread UI).';

-- ---------------------------------------------------------------------------
-- 2. Who may access an assignment row for help (parent profile, parent family_members, or child in scope)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_can_access_assignment(p_family_id uuid, p_child_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Parent / member via profiles.family_id
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.family_id IS NOT NULL
        AND p.family_id = p_family_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = p_family_id
        AND fm.user_id = auth.uid()
        AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'parent'
    )
    OR EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = p_family_id
        AND fm.user_id = auth.uid()
        AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'child'
        AND fm.child_scope IS NOT NULL
        AND p_child_id = ANY (fm.child_scope)
    );
$$;

COMMENT ON FUNCTION public.auth_can_access_assignment(uuid, uuid) IS
  'True if auth.uid() may read/write help for this family+child (parent or scoped child).';

GRANT EXECUTE ON FUNCTION public.auth_can_access_assignment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_access_assignment(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Append a help message (child or parent); optional reason (e.g. stuck / too_hard / question)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.append_assignment_help_message(
  p_assignment_id uuid,
  p_body text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a public.assignments%ROWTYPE;
  v_role text;
  v_msg jsonb;
BEGIN
  IF p_body IS NULL OR btrim(p_body) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'body required');
  END IF;

  SELECT * INTO v_a FROM public.assignments WHERE id = p_assignment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assignment not found');
  END IF;

  IF NOT public.auth_can_access_assignment(v_a.family_id, v_a.child_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Resolve sender role: parent-family access vs child in child_scope
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.family_id IS NOT NULL
      AND p.family_id = v_a.family_id
  )
  OR EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.family_id = v_a.family_id
      AND fm.user_id = auth.uid()
      AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'parent'
  ) THEN
    v_role := 'parent';
  ELSIF EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.family_id = v_a.family_id
      AND fm.user_id = auth.uid()
      AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'child'
      AND fm.child_scope IS NOT NULL
      AND v_a.child_id = ANY (fm.child_scope)
  ) THEN
    v_role := 'child';
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  v_msg := jsonb_build_object(
    'id', gen_random_uuid(),
    'sender_role', v_role,
    'author_id', auth.uid(),
    'body', p_body,
    'reason', p_reason,
    'created_at', now()
  );

  UPDATE public.assignments
  SET
    help_message_log = COALESCE(help_message_log, '[]'::jsonb) || jsonb_build_array(v_msg),
    need_help = CASE WHEN v_role = 'child' THEN true ELSE need_help END,
    updated_at = now()
  WHERE id = p_assignment_id;

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', p_assignment_id,
    'message', v_msg
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_assignment_help_message(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_assignment_help_message(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Mark help thread read (caller is parent or child — inferred from access pattern)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_assignment_help_read(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a public.assignments%ROWTYPE;
  v_is_parent boolean;
BEGIN
  SELECT * INTO v_a FROM public.assignments WHERE id = p_assignment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assignment not found');
  END IF;

  IF NOT public.auth_can_access_assignment(v_a.family_id, v_a.child_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  v_is_parent :=
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.family_id IS NOT NULL
        AND p.family_id = v_a.family_id
    )
    OR EXISTS (
      SELECT 1 FROM public.family_members fm
      WHERE fm.family_id = v_a.family_id
        AND fm.user_id = auth.uid()
        AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'parent'
    );

  IF v_is_parent THEN
    UPDATE public.assignments
    SET help_parent_last_read_at = now(), updated_at = now()
    WHERE id = p_assignment_id;
  ELSE
    UPDATE public.assignments
    SET help_child_last_read_at = now(), updated_at = now()
    WHERE id = p_assignment_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'assignment_id', p_assignment_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_assignment_help_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_assignment_help_read(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. get_assignments: include help columns + allow scoped child (not only profiles.family_id)
-- ---------------------------------------------------------------------------
-- Return row shape changed; CREATE OR REPLACE cannot change OUT params. Drop every overload
-- (name-only DROP can fail if multiple signatures exist; CASCADE clears PostgREST deps).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS proc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_assignments'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.proc);
  END LOOP;
END
$$;

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

-- ---------------------------------------------------------------------------
-- 6. toggle_need_help: same access as help RPCs (child logins supported)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_need_help(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a public.assignments%ROWTYPE;
  v_new_need_help boolean;
BEGIN
  SELECT * INTO v_a FROM public.assignments WHERE id = p_assignment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assignment not found');
  END IF;

  IF NOT public.auth_can_access_assignment(v_a.family_id, v_a.child_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  v_new_need_help := NOT COALESCE(v_a.need_help, false);

  UPDATE public.assignments
  SET need_help = v_new_need_help, updated_at = now()
  WHERE id = p_assignment_id;

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', p_assignment_id,
    'need_help', v_new_need_help
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_need_help(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_need_help(uuid) TO service_role;
