-- Create RPC function to permanently delete all trash events for a family (bypasses RLS)
-- This allows hard-deleting all soft-deleted events that RLS policies might block

CREATE OR REPLACE FUNCTION permanently_delete_all_trash_events(_family_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted_count INT;
BEGIN
  -- Verify family membership
  IF NOT is_family_member(_family_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Permanently delete all soft-deleted events for this family
  DELETE FROM events
  WHERE family_id = _family_id
    AND deleted_at IS NOT NULL;

  GET DIAGNOSTICS _deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true, 
    'deleted_count', _deleted_count
  );
END;
$$;

COMMENT ON FUNCTION permanently_delete_all_trash_events IS 'Permanently delete all soft-deleted events for a family (hard delete, bypasses RLS)';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION permanently_delete_all_trash_events(UUID) TO authenticated, service_role;

