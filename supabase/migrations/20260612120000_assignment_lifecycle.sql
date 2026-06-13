-- Assignment lifecycle: draft→assigned→in_progress→submitted→reviewed,
-- assignment-specific comments (separate from help thread and DMs),
-- and subject bulletin activity feed.

-- ---------------------------------------------------------------------------
-- 1. Extend assignment status values
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.assignments') IS NULL THEN
    RAISE NOTICE 'assignments table missing; skipping migration';
    RETURN;
  END IF;

  ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_status_check;
  ALTER TABLE public.assignments
    ADD CONSTRAINT assignments_status_check
    CHECK (status IN (
      'draft', 'assigned', 'not_started', 'in_progress',
      'submitted', 'reviewed', 'accepted'
    ));
END
$$;

COMMENT ON COLUMN public.assignments.status IS
  'Lifecycle: draft → assigned → in_progress → submitted → reviewed/accepted. needs_revision uses review_status.';

-- ---------------------------------------------------------------------------
-- 2. Assignment comment thread (separate from help_message_log and DMs)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.assignments') IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'comment_log'
  ) THEN
    ALTER TABLE public.assignments
      ADD COLUMN comment_log jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'comment_parent_last_read_at'
  ) THEN
    ALTER TABLE public.assignments
      ADD COLUMN comment_parent_last_read_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'comment_child_last_read_at'
  ) THEN
    ALTER TABLE public.assignments
      ADD COLUMN comment_child_last_read_at timestamptz;
  END IF;
END
$$;

COMMENT ON COLUMN public.assignments.comment_log IS
  'Assignment-specific Q&A thread: {id, sender_role, author_id, body, created_at}. Not DMs or help requests.';

-- ---------------------------------------------------------------------------
-- 3. Subject bulletin activity (assignment events, not messages)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assignment_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.family (id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.assignments (id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subject (id) ON DELETE SET NULL,
  child_id uuid REFERENCES public.children (id) ON DELETE SET NULL,
  activity_type text NOT NULL CHECK (activity_type IN (
    'assigned', 'submitted', 'question', 'returned', 'completed', 'comment'
  )),
  summary text NOT NULL CHECK (char_length(trim(summary)) > 0),
  actor_role text CHECK (actor_role IN ('parent', 'child', 'system')),
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assignment_activity_family_created_idx
  ON public.assignment_activity (family_id, created_at DESC);

CREATE INDEX IF NOT EXISTS assignment_activity_subject_created_idx
  ON public.assignment_activity (subject_id, created_at DESC)
  WHERE subject_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS assignment_activity_assignment_idx
  ON public.assignment_activity (assignment_id, created_at DESC)
  WHERE assignment_id IS NOT NULL;

ALTER TABLE public.assignment_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assignment_activity_select ON public.assignment_activity;
CREATE POLICY assignment_activity_select ON public.assignment_activity
  FOR SELECT USING (public.is_family_member(family_id));

GRANT SELECT ON public.assignment_activity TO authenticated;
GRANT ALL ON public.assignment_activity TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Append assignment comment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.append_assignment_comment(
  p_assignment_id uuid,
  p_body text
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

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.family_id IS NOT NULL AND p.family_id = v_a.family_id
  ) OR EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.family_id = v_a.family_id AND fm.user_id = auth.uid()
      AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'parent'
  ) THEN
    v_role := 'parent';
  ELSIF EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.family_id = v_a.family_id AND fm.user_id = auth.uid()
      AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'child'
      AND fm.child_scope IS NOT NULL AND v_a.child_id = ANY (fm.child_scope)
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
    'created_at', now()
  );

  UPDATE public.assignments
  SET
    comment_log = COALESCE(comment_log, '[]'::jsonb) || jsonb_build_array(v_msg),
    updated_at = now()
  WHERE id = p_assignment_id;

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', p_assignment_id,
    'message', v_msg,
    'sender_role', v_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_assignment_comment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_assignment_comment(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Mark assignment comments read
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_assignment_comments_read(p_assignment_id uuid)
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
      WHERE p.id = auth.uid() AND p.family_id IS NOT NULL AND p.family_id = v_a.family_id
    )
    OR EXISTS (
      SELECT 1 FROM public.family_members fm
      WHERE fm.family_id = v_a.family_id AND fm.user_id = auth.uid()
        AND LOWER(TRIM(COALESCE(fm.member_role, ''))) = 'parent'
    );

  IF v_is_parent THEN
    UPDATE public.assignments
    SET comment_parent_last_read_at = now(), updated_at = now()
    WHERE id = p_assignment_id;
  ELSE
    UPDATE public.assignments
    SET comment_child_last_read_at = now(), updated_at = now()
    WHERE id = p_assignment_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'assignment_id', p_assignment_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_assignment_comments_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_assignment_comments_read(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Record assignment activity for subject bulletin feed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_assignment_activity(
  p_family_id uuid,
  p_assignment_id uuid,
  p_subject_id uuid,
  p_child_id uuid,
  p_activity_type text,
  p_summary text,
  p_actor_role text DEFAULT 'system',
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.assignment_activity%ROWTYPE;
BEGIN
  IF p_summary IS NULL OR btrim(p_summary) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'summary required');
  END IF;

  IF NOT public.is_family_member(p_family_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  INSERT INTO public.assignment_activity (
    family_id, assignment_id, subject_id, child_id,
    activity_type, summary, actor_role, actor_user_id
  ) VALUES (
    p_family_id,
    p_assignment_id,
    p_subject_id,
    p_child_id,
    p_activity_type,
    btrim(p_summary),
    COALESCE(p_actor_role, 'system'),
    COALESCE(p_actor_user_id, auth.uid())
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'success', true,
    'activity_id', v_row.id,
    'created_at', v_row.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_assignment_activity(
  uuid, uuid, uuid, uuid, text, text, text, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_assignment_activity(
  uuid, uuid, uuid, uuid, text, text, text, uuid
) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Fetch assignment activity for a subject bulletin stream
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_assignment_activity_for_subject(
  p_family_id uuid,
  p_subject_id uuid,
  p_limit int DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  assignment_id uuid,
  subject_id uuid,
  child_id uuid,
  activity_type text,
  summary text,
  actor_role text,
  actor_user_id uuid,
  created_at timestamptz,
  child_first_name text,
  assignment_title text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT public.is_family_member(p_family_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    aa.id,
    aa.assignment_id,
    aa.subject_id,
    aa.child_id,
    aa.activity_type,
    aa.summary,
    aa.actor_role,
    aa.actor_user_id,
    aa.created_at,
    c.first_name AS child_first_name,
    a.title AS assignment_title
  FROM public.assignment_activity aa
  LEFT JOIN public.children c ON c.id = aa.child_id
  LEFT JOIN public.assignments a ON a.id = aa.assignment_id
  WHERE aa.family_id = p_family_id
    AND (p_subject_id IS NULL OR aa.subject_id = p_subject_id)
  ORDER BY aa.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 30), 100));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assignment_activity_for_subject(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_assignment_activity_for_subject(uuid, uuid, int) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. get_assignments — include comment_log columns
-- ---------------------------------------------------------------------------
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
  start_work_by date,
  status text,
  review_status text,
  review_feedback text,
  reviewed_at timestamptz,
  linked_event_ids jsonb,
  linked_evidence_ids jsonb,
  linked_review_attachment_ids jsonb,
  need_help boolean,
  help_message_log jsonb,
  help_parent_last_read_at timestamptz,
  help_child_last_read_at timestamptz,
  comment_log jsonb,
  comment_parent_last_read_at timestamptz,
  comment_child_last_read_at timestamptz,
  submitted_at timestamptz,
  progress_percent integer,
  grade_display text,
  grade_value numeric,
  rubric_id uuid,
  max_score numeric,
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

  IF v_child_family_id IS NULL THEN RETURN; END IF;
  IF NOT public.auth_can_access_assignment(v_child_family_id, p_child_id) THEN RETURN; END IF;

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
    a.start_work_by,
    a.status,
    a.review_status,
    a.review_feedback,
    a.reviewed_at,
    a.linked_event_ids,
    a.linked_evidence_ids,
    COALESCE(a.linked_review_attachment_ids, '[]'::jsonb),
    a.need_help,
    a.help_message_log,
    a.help_parent_last_read_at,
    a.help_child_last_read_at,
    COALESCE(a.comment_log, '[]'::jsonb),
    a.comment_parent_last_read_at,
    a.comment_child_last_read_at,
    a.submitted_at,
    a.progress_percent,
    a.grade_display,
    a.grade_value,
    a.rubric_id,
    a.max_score,
    a.created_at,
    a.updated_at,
    a.created_by
  FROM public.assignments a
  LEFT JOIN public.profiles p ON p.id = a.assigned_by
  LEFT JOIN public.subject s ON s.id = a.related_subject
  WHERE a.child_id = p_child_id
    AND COALESCE(a.status, '') <> 'draft'
  ORDER BY
    CASE WHEN a.due_date IS NOT NULL THEN 0 ELSE 1 END,
    a.due_date ASC NULLS LAST,
    a.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assignments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_assignments(uuid) TO service_role;
