-- Create an RPC function to delete events with elevated privileges
-- This bypasses RLS issues by using SECURITY DEFINER

CREATE OR REPLACE FUNCTION delete_event(
  _event_id uuid,
  _family_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted_count int;
  _event_family_id uuid;
BEGIN
  -- Verify the event exists and belongs to the family
  SELECT family_id INTO _event_family_id
  FROM events
  WHERE id = _event_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Event not found'
    );
  END IF;
  
  IF _event_family_id != _family_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Event does not belong to the specified family'
    );
  END IF;
  
  -- Soft delete the event by setting deleted_at timestamp (with SECURITY DEFINER, this bypasses RLS)
  UPDATE events
  SET deleted_at = NOW()
  WHERE id = _event_id AND deleted_at IS NULL;
  
  GET DIAGNOSTICS _deleted_count = ROW_COUNT;
  
  IF _deleted_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No rows were updated. Event may already be deleted or not found.'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', _deleted_count,
    'message', 'Event deleted successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', SQLSTATE
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION delete_event(uuid, uuid) TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION delete_event IS 'Deletes an event with elevated privileges, bypassing RLS. Verifies family_id before deletion.';
