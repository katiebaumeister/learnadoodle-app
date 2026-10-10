-- Tighten client AI metering RPC: allowlisted action types only; ignore client-supplied units.

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
  v_action text;
BEGIN
  IF p_family_id IS NULL OR p_action_type IS NULL OR btrim(p_action_type) = '' THEN
    RETURN;
  END IF;

  IF NOT is_family_member (p_family_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_action := btrim(p_action_type);

  -- Server-defined weights only (p_units ignored to prevent client under/over-reporting).
  v_units := CASE v_action
    WHEN 'chatbotSimple' THEN 1
    WHEN 'chatbotPlannerAware' THEN 2
    WHEN 'smallEdit' THEN 2
    WHEN 'rebalanceSingleWeek' THEN 10
    WHEN 'resolveConflicts' THEN 6
    WHEN 'adjustSubjectPacing' THEN 6
    WHEN 'parsePlainTextToStructure' THEN 8
    WHEN 'generatePlanWeek' THEN 12
    WHEN 'generatePlanMultiWeek' THEN 18
    WHEN 'parseUploadedMaterial' THEN 25
    WHEN 'curriculumImportStructuring' THEN 30
    WHEN 'fullSystemRebalanceMultiWeek' THEN 25
    ELSE NULL
  END;

  IF v_units IS NULL THEN
    RAISE EXCEPTION 'unknown ai action_type';
  END IF;

  BEGIN
    INSERT INTO public.ai_usage_ledger (family_id, action_type, units, idempotency_key, metadata)
    VALUES (
      p_family_id,
      v_action,
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
  'Meters AI units for a family. Allowlisted action_type only; units are server-defined.';
