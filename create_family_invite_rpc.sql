-- Create RPC function to insert invites, bypassing RLS
-- This function uses SECURITY DEFINER to run with elevated privileges

CREATE OR REPLACE FUNCTION create_family_invite(
  p_family_id uuid,
  p_email text,
  p_token text,
  p_role text,
  p_child_scope uuid[],
  p_expires_at timestamptz,
  p_invited_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite_id uuid;
  v_error_msg text;
BEGIN
  -- Insert the invite directly (bypasses RLS due to SECURITY DEFINER)
  BEGIN
    INSERT INTO invites (
      family_id,
      email,
      token,
      role,
      child_scope,
      expires_at,
      invited_by
    ) VALUES (
      p_family_id,
      p_email,
      p_token,
      p_role,
      p_child_scope,
      p_expires_at,
      p_invited_by
    )
    RETURNING id INTO v_invite_id;

    -- Return success with invite ID
    RETURN jsonb_build_object(
      'success', true,
      'invite_id', v_invite_id,
      'token', p_token
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture the error message
      v_error_msg := SQLERRM || ' (SQLSTATE: ' || SQLSTATE || ')';
      -- Return error details
      RETURN jsonb_build_object(
        'success', false,
        'error', v_error_msg,
        'sqlstate', SQLSTATE
      );
  END;
EXCEPTION
  WHEN OTHERS THEN
    -- Outer exception handler (shouldn't normally be reached)
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM || ' (SQLSTATE: ' || SQLSTATE || ')',
      'sqlstate', SQLSTATE
    );
END;
$$;

-- Grant execute permission
-- Note: service_role is used by the backend, authenticated is used by frontend direct calls
GRANT EXECUTE ON FUNCTION create_family_invite(uuid, text, text, text, uuid[], timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION create_family_invite(uuid, text, text, text, uuid[], timestamptz, uuid) TO authenticated;
-- Also grant to anon in case PostgREST needs it (though backend uses service_role)
GRANT EXECUTE ON FUNCTION create_family_invite(uuid, text, text, text, uuid[], timestamptz, uuid) TO anon;

-- Add comment
COMMENT ON FUNCTION create_family_invite IS 'Creates a family invite, bypassing RLS using SECURITY DEFINER';

