-- Create RPC function to permanently delete materials (bypasses RLS)
-- This allows hard-deleting soft-deleted materials that RLS policies might block

CREATE OR REPLACE FUNCTION permanently_delete_material(_material_id UUID, _family_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted_count INT;
  _storage_path TEXT;
BEGIN
  -- Verify family membership
  IF NOT is_family_member(_family_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Get storage_path before deleting (for cleanup)
  SELECT storage_path INTO _storage_path
  FROM materials
  WHERE id = _material_id
    AND family_id = _family_id;

  -- Permanently delete the material record
  DELETE FROM materials
  WHERE id = _material_id
    AND family_id = _family_id;

  GET DIAGNOSTICS _deleted_count = ROW_COUNT;

  IF _deleted_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Material not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'id', _material_id,
    'storage_path', _storage_path
  );
END;
$$;

COMMENT ON FUNCTION permanently_delete_material IS 'Permanently delete a material (hard delete, bypasses RLS)';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION permanently_delete_material(UUID, UUID) TO authenticated, service_role;

