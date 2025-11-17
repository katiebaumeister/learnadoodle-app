-- Phase 6: Parent/Child/Tutor Ecosystem + Integrations
-- Chunk B: Tutor-aware invites

-- 1) Create invites table (if not exists)
CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('parent','child','tutor')) DEFAULT 'parent',
  child_scope uuid[] DEFAULT '{}', -- for tutors: which children they can access
  token text NOT NULL UNIQUE, -- unique invite token
  invited_by uuid REFERENCES profiles(id), -- who created the invite
  expires_at timestamptz, -- optional expiration
  accepted_at timestamptz, -- when invite was accepted
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS invites_family_id_idx ON invites(family_id);
CREATE INDEX IF NOT EXISTS invites_email_idx ON invites(email);
CREATE INDEX IF NOT EXISTS invites_token_idx ON invites(token);
CREATE INDEX IF NOT EXISTS invites_role_idx ON invites(role);

-- Enable RLS
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- 2) RLS Policies for invites
-- Users can view invites sent to their email
DROP POLICY IF EXISTS "Users can view own invites" ON invites;
CREATE POLICY "Users can view own invites" ON invites
  FOR SELECT
  TO authenticated
  USING (
    email = (SELECT email FROM profiles WHERE id = auth.uid())
    OR invited_by = auth.uid()
  );

-- Parents can create/update invites for their family
DROP POLICY IF EXISTS "Parents can manage family invites" ON invites;
CREATE POLICY "Parents can manage family invites" ON invites
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = invites.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = invites.family_id
        AND NOT EXISTS (SELECT 1 FROM family_members fm WHERE fm.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = invites.family_id
        AND fm.user_id = auth.uid()
        AND fm.member_role = 'parent'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.family_id = invites.family_id
        AND NOT EXISTS (SELECT 1 FROM family_members fm WHERE fm.user_id = auth.uid())
    )
  );

-- Service role can read all (for backend)
DROP POLICY IF EXISTS "Service role can read all invites" ON invites;
CREATE POLICY "Service role can read all invites" ON invites
  FOR SELECT
  TO service_role
  USING (true);

-- 3) Create function to accept invite
CREATE OR REPLACE FUNCTION accept_invite(
  p_token text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite invites%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_child_id uuid;
  v_family_member_id uuid;
BEGIN
  -- Find the invite by token
  SELECT * INTO v_invite
  FROM invites
  WHERE token = p_token
    AND accepted_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid or expired invite token'
    );
  END IF;

  -- Get or create profile for this user
  SELECT * INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Profile not found'
    );
  END IF;

  -- Verify email matches (unless invite was sent to existing user)
  IF v_profile.email != v_invite.email THEN
    -- Allow if email matches current user's email
    IF (SELECT email FROM profiles WHERE id = auth.uid()) != v_invite.email THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Email mismatch'
      );
    END IF;
  END IF;

  -- Update profile with role
  UPDATE profiles
  SET role = v_invite.role,
      family_id = v_invite.family_id,
      updated_at = now()
  WHERE id = p_user_id;

  -- Create or update family_members entry
  INSERT INTO family_members (
    family_id,
    user_id,
    member_role,
    child_scope
  )
  VALUES (
    v_invite.family_id,
    p_user_id,
    v_invite.role,
    v_invite.child_scope
  )
  ON CONFLICT (family_id, user_id) 
  DO UPDATE SET
    member_role = EXCLUDED.member_role,
    child_scope = EXCLUDED.child_scope,
    updated_at = now();

  -- If role is 'child', ensure child_scope contains the actual child record
  -- For children, the invite's child_scope should already contain the child_id
  -- If not set, try to find a child record matching the invite email or user
  IF v_invite.role = 'child' THEN
    -- If child_scope is empty, try to find child record by email or user
    IF array_length(v_invite.child_scope, 1) IS NULL OR array_length(v_invite.child_scope, 1) = 0 THEN
      -- Try to find child record for this email or user
      SELECT id INTO v_child_id
      FROM children
      WHERE family_id = v_invite.family_id
        AND (email = v_invite.email OR user_id = p_user_id)
      LIMIT 1;

      -- If child record found, update child_scope
      IF v_child_id IS NOT NULL THEN
        UPDATE family_members
        SET child_scope = ARRAY[v_child_id]
        WHERE family_id = v_invite.family_id
          AND user_id = p_user_id;
      END IF;
    END IF;
  END IF;

  -- Mark invite as accepted
  UPDATE invites
  SET accepted_at = now(),
      updated_at = now()
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'success', true,
    'family_id', v_invite.family_id,
    'role', v_invite.role,
    'child_scope', v_invite.child_scope
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION accept_invite(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_invite(text, uuid) TO service_role;

-- Add comment
COMMENT ON FUNCTION accept_invite IS 'Accepts an invite token, updates profile role, and creates family_members entry';

