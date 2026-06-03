-- Family direct messages (parent ↔ child / parent ↔ tutor / parent ↔ parent).

CREATE TABLE IF NOT EXISTS public.family_direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.family (id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  recipient_child_id uuid NULL REFERENCES public.children (id) ON DELETE CASCADE,
  recipient_user_id uuid NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT family_direct_messages_recipient_check CHECK (
    (recipient_child_id IS NOT NULL AND recipient_user_id IS NULL)
    OR (recipient_child_id IS NULL AND recipient_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS family_direct_messages_family_created_idx
  ON public.family_direct_messages (family_id, created_at DESC);

CREATE INDEX IF NOT EXISTS family_direct_messages_family_child_idx
  ON public.family_direct_messages (family_id, recipient_child_id, created_at DESC)
  WHERE recipient_child_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS family_direct_messages_family_user_idx
  ON public.family_direct_messages (family_id, recipient_user_id, created_at DESC)
  WHERE recipient_user_id IS NOT NULL;

COMMENT ON TABLE public.family_direct_messages IS
  'Direct messages between family members (by auth user id and/or child id).';

ALTER TABLE public.family_direct_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_direct_messages_select ON public.family_direct_messages;
CREATE POLICY family_direct_messages_select ON public.family_direct_messages
  FOR SELECT
  USING (is_family_member (family_id));

DROP POLICY IF EXISTS family_direct_messages_insert ON public.family_direct_messages;
CREATE POLICY family_direct_messages_insert ON public.family_direct_messages
  FOR INSERT
  WITH CHECK (
    is_family_member (family_id)
    AND sender_user_id = auth.uid ()
  );

GRANT SELECT, INSERT ON public.family_direct_messages TO authenticated;
GRANT ALL ON public.family_direct_messages TO service_role;
