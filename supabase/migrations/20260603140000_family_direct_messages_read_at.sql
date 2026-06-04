-- Read receipts for family direct messages.

ALTER TABLE public.family_direct_messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

COMMENT ON COLUMN public.family_direct_messages.read_at IS
  'When the recipient opened the thread and read this message.';

CREATE INDEX IF NOT EXISTS family_direct_messages_unread_recipient_user_idx
  ON public.family_direct_messages (family_id, recipient_user_id, created_at DESC)
  WHERE read_at IS NULL AND recipient_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS family_direct_messages_unread_recipient_child_idx
  ON public.family_direct_messages (family_id, recipient_child_id, created_at DESC)
  WHERE read_at IS NULL AND recipient_child_id IS NOT NULL;

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
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.mark_family_direct_messages_read(uuid[]) IS
  'Mark direct messages as read for the current recipient only.';

GRANT EXECUTE ON FUNCTION public.mark_family_direct_messages_read(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_family_direct_messages_read(uuid[]) TO service_role;
