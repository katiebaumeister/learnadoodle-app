-- Allow authenticated family members to meter AI usage from the Doodle command pane.
-- Direct INSERT on ai_usage_ledger remains blocked; this SECURITY DEFINER RPC inserts after membership check.

CREATE OR REPLACE FUNCTION public.record_family_ai_usage (
  p_family_id uuid,
  p_action_type text,
  p_units integer DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_units integer;
BEGIN
  IF p_family_id IS NULL OR p_action_type IS NULL OR btrim(p_action_type) = '' THEN
    RETURN;
  END IF;

  IF NOT is_family_member (p_family_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_units := COALESCE(
    p_units,
    CASE p_action_type
      WHEN 'chatbotSimple' THEN 1
      WHEN 'chatbotPlannerAware' THEN 2
      WHEN 'smallEdit' THEN 2
      ELSE 1
    END
  );

  BEGIN
    INSERT INTO public.ai_usage_ledger (family_id, action_type, units, idempotency_key, metadata)
    VALUES (
      p_family_id,
      p_action_type,
      v_units,
      NULLIF(btrim(COALESCE(p_idempotency_key, '')), ''),
      COALESCE(p_metadata, '{}'::jsonb)
    );
  EXCEPTION
    WHEN unique_violation THEN
      NULL; -- idempotent retry
  END;
END;
$$;

COMMENT ON FUNCTION public.record_family_ai_usage (uuid, text, integer, text, jsonb) IS
  'Meters AI units for a family (Doodle pane / client LLM). Requires is_family_member.';

GRANT EXECUTE ON FUNCTION public.record_family_ai_usage (uuid, text, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_family_ai_usage (uuid, text, integer, text, jsonb) TO service_role;
