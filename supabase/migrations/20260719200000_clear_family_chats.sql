-- Parent-only clear for family Messages (direct messages).
-- Authenticated clients only have SELECT/INSERT on these tables; clears go through SECURITY DEFINER.
-- Group threads are kept so Settings → Messages streams stay listed at 0 after clear.

CREATE OR REPLACE FUNCTION public.clear_family_direct_messages(
  p_family_id uuid,
  p_clear_all boolean DEFAULT false,
  p_message_ids uuid[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  IF p_family_id IS NULL THEN
    RAISE EXCEPTION 'Missing family id';
  END IF;

  IF NOT public.is_family_parent(p_family_id) THEN
    RAISE EXCEPTION 'Only parents can clear family messages';
  END IF;

  IF coalesce(p_clear_all, false) THEN
    DELETE FROM public.family_direct_messages
    WHERE family_id = p_family_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  ELSE
    IF p_message_ids IS NULL OR cardinality(p_message_ids) = 0 THEN
      RETURN 0;
    END IF;

    DELETE FROM public.family_direct_messages
    WHERE family_id = p_family_id
      AND id = ANY (p_message_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.clear_family_direct_messages(uuid, boolean, uuid[]) IS
  'Parent-only: delete all family DMs, or specific message ids. Keeps group threads.';

GRANT EXECUTE ON FUNCTION public.clear_family_direct_messages(uuid, boolean, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_family_direct_messages(uuid, boolean, uuid[]) TO service_role;
