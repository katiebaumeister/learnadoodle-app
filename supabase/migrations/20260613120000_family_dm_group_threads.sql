-- Family group message threads (parent ↔ multiple children in one conversation).

CREATE TABLE IF NOT EXISTS public.family_dm_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.family (id) ON DELETE CASCADE,
  thread_key text NOT NULL,
  display_name text NOT NULL,
  member_child_ids uuid[] NOT NULL DEFAULT '{}',
  member_user_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT family_dm_threads_member_count_check CHECK (
    cardinality(member_child_ids) + cardinality(member_user_ids) >= 2
  ),
  CONSTRAINT family_dm_threads_unique_key UNIQUE (family_id, thread_key)
);

CREATE INDEX IF NOT EXISTS family_dm_threads_family_idx
  ON public.family_dm_threads (family_id, created_at DESC);

COMMENT ON TABLE public.family_dm_threads IS
  'Multi-member family message threads (group text).';

ALTER TABLE public.family_direct_messages
  ADD COLUMN IF NOT EXISTS thread_id uuid NULL REFERENCES public.family_dm_threads (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS family_direct_messages_thread_idx
  ON public.family_direct_messages (family_id, thread_id, created_at DESC)
  WHERE thread_id IS NOT NULL;

ALTER TABLE public.family_direct_messages
  DROP CONSTRAINT IF EXISTS family_direct_messages_recipient_check;

ALTER TABLE public.family_direct_messages
  ADD CONSTRAINT family_direct_messages_recipient_check CHECK (
    (
      thread_id IS NOT NULL
      AND recipient_child_id IS NULL
      AND recipient_user_id IS NULL
    )
    OR (
      thread_id IS NULL
      AND (
        (recipient_child_id IS NOT NULL AND recipient_user_id IS NULL)
        OR (recipient_child_id IS NULL AND recipient_user_id IS NOT NULL)
      )
    )
  );

ALTER TABLE public.family_dm_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_dm_threads_select ON public.family_dm_threads;
CREATE POLICY family_dm_threads_select ON public.family_dm_threads
  FOR SELECT
  USING (is_family_member (family_id));

DROP POLICY IF EXISTS family_dm_threads_insert ON public.family_dm_threads;
CREATE POLICY family_dm_threads_insert ON public.family_dm_threads
  FOR INSERT
  WITH CHECK (is_family_member (family_id));

GRANT SELECT, INSERT ON public.family_dm_threads TO authenticated;
GRANT ALL ON public.family_dm_threads TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_family_dm_thread(
  p_family_id uuid,
  p_thread_key text,
  p_display_name text,
  p_member_child_ids uuid[],
  p_member_user_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_id uuid;
  v_child_ids uuid[];
  v_user_ids uuid[];
BEGIN
  IF p_family_id IS NULL OR trim(coalesce(p_thread_key, '')) = '' THEN
    RAISE EXCEPTION 'Missing family or thread key';
  END IF;

  IF NOT public.is_family_member(p_family_id) THEN
    RAISE EXCEPTION 'Not a family member';
  END IF;

  v_child_ids := COALESCE(p_member_child_ids, ARRAY[]::uuid[]);
  v_user_ids := COALESCE(p_member_user_ids, ARRAY[]::uuid[]);

  IF cardinality(v_child_ids) + cardinality(v_user_ids) < 2 THEN
    RAISE EXCEPTION 'Group threads require at least two members';
  END IF;

  INSERT INTO public.family_dm_threads (
    family_id,
    thread_key,
    display_name,
    member_child_ids,
    member_user_ids
  )
  VALUES (
    p_family_id,
    trim(p_thread_key),
    trim(coalesce(p_display_name, 'Group')),
    v_child_ids,
    v_user_ids
  )
  ON CONFLICT (family_id, thread_key) DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    member_child_ids = EXCLUDED.member_child_ids,
    member_user_ids = EXCLUDED.member_user_ids
  RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_family_dm_thread(uuid, text, text, uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_family_dm_thread(uuid, text, text, uuid[], uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_family_direct_messages_read(p_message_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL OR p_message_ids IS NULL OR array_length(p_message_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.family_direct_messages AS m
  SET read_at = now()
  WHERE m.id = ANY(p_message_ids)
    AND m.read_at IS NULL
    AND m.sender_user_id <> v_uid
    AND public.is_family_member(m.family_id)
    AND (
      m.recipient_user_id = v_uid
      OR (
        m.recipient_child_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.family_members AS fm
          WHERE fm.user_id = v_uid
            AND fm.family_id = m.family_id
            AND (
              fm.child_id = m.recipient_child_id
              OR m.recipient_child_id = ANY(COALESCE(fm.child_scope, ARRAY[]::uuid[]))
            )
        )
      )
      OR (
        m.thread_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.family_dm_threads AS t
          WHERE t.id = m.thread_id
            AND t.family_id = m.family_id
            AND (
              v_uid = ANY(COALESCE(t.member_user_ids, ARRAY[]::uuid[]))
              OR EXISTS (
                SELECT 1
                FROM public.family_members AS fm
                WHERE fm.user_id = v_uid
                  AND fm.family_id = t.family_id
                  AND (
                    fm.child_id = ANY(COALESCE(t.member_child_ids, ARRAY[]::uuid[]))
                    OR COALESCE(fm.child_scope, ARRAY[]::uuid[]) && COALESCE(t.member_child_ids, ARRAY[]::uuid[])
                  )
              )
            )
        )
      )
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
