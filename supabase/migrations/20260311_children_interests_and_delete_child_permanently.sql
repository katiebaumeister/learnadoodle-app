-- 1) Ensure children table has interests column (for edit-child and onboarding persistence)
-- 2) Add delete_child_permanently RPC (name confirmation then delete) for Edit Child / Danger Zone

-- ============================================================
-- 1. Add interests to children if missing
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'children' AND column_name = 'interests'
  ) THEN
    ALTER TABLE children ADD COLUMN interests TEXT[] DEFAULT '{}';
    COMMENT ON COLUMN children.interests IS 'Learner interests (e.g. STEM, Reading, Other: Gardening). Synced from edit form and onboarding.';
  END IF;
END $$;

-- ============================================================
-- 2. delete_child_permanently: name confirmation then delete
-- ============================================================
CREATE OR REPLACE FUNCTION delete_child_permanently(
  _family uuid,
  _child uuid,
  _confirm_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child_name text;
  v_deleted boolean;
BEGIN
  -- Resolve child and family
  SELECT first_name INTO v_child_name
  FROM children
  WHERE id = _child AND family_id = _family;

  IF v_child_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Require name match (trim, case-insensitive)
  IF COALESCE(TRIM(LOWER(_confirm_name)), '') <> COALESCE(TRIM(LOWER(v_child_name)), '') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'name_mismatch');
  END IF;

  -- Optional: ensure caller is a member of this family (recommended for security)
  IF NOT EXISTS (
    SELECT 1 FROM family_members fm
    WHERE fm.family_id = _family
      AND fm.user_id = auth.uid()
      AND fm.member_role IN ('parent', 'admin', 'owner')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  -- Delete child (CASCADE handles related rows)
  DELETE FROM children
  WHERE id = _child AND family_id = _family;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF NOT v_deleted THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Remove child from family_members child_scope
  UPDATE family_members
  SET child_scope = array_remove(child_scope, _child),
      updated_at = now()
  WHERE family_id = _family
    AND _child = ANY(child_scope);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION delete_child_permanently(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_child_permanently(uuid, uuid, text) TO service_role;
COMMENT ON FUNCTION delete_child_permanently(uuid, uuid, text) IS 'Permanently deletes a child after confirming the child name. Used by Edit Child modal and Danger Zone.';
