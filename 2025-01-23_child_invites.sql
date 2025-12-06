-- Child Invites System
-- Extends existing invites table to support child login flow

-- Ensure invites table supports child role (should already exist)
-- Add child-specific fields if needed
DO $$
BEGIN
  -- Add child_id reference if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invites' AND column_name = 'child_id'
  ) THEN
    ALTER TABLE invites ADD COLUMN child_id uuid REFERENCES children(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS invites_child_id_idx ON invites(child_id);
  END IF;
END $$;

-- Create child_invites view for easier querying (optional helper)
CREATE OR REPLACE VIEW child_invites_view AS
SELECT 
  i.id,
  i.family_id,
  i.email,
  i.role,
  i.child_scope,
  i.token,
  i.invited_by,
  i.expires_at,
  i.accepted_at,
  i.created_at,
  i.updated_at,
  i.child_id,
  c.first_name as child_name,
  f.name as family_name
FROM invites i
LEFT JOIN children c ON i.child_id = c.id
LEFT JOIN family f ON i.family_id = f.id
WHERE i.role = 'child';

-- RPC: Create child invite
CREATE OR REPLACE FUNCTION create_child_invite(
  _family_id uuid,
  _child_id uuid,
  _invited_by uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _token text;
  _invite_id uuid;
  _child_email text;
BEGIN
  -- Verify child belongs to family
  IF NOT EXISTS (
    SELECT 1 FROM children 
    WHERE id = _child_id AND family_id = _family_id
  ) THEN
    RAISE EXCEPTION 'Child does not belong to family';
  END IF;

  -- Get child's name for email placeholder
  SELECT first_name INTO _child_email FROM children WHERE id = _child_id;

  -- Generate secure token
  _token := encode(gen_random_bytes(32), 'base64url');

  -- Create invite
  INSERT INTO invites (
    family_id,
    email, -- Use child's name + placeholder email format
    role,
    child_id,
    child_scope,
    token,
    invited_by,
    expires_at
  ) VALUES (
    _family_id,
    COALESCE(_child_email, 'child') || '@family.local', -- Placeholder email
    'child',
    _child_id,
    ARRAY[_child_id]::uuid[], -- Child can only see themselves
    _token,
    _invited_by,
    now() + interval '30 days'
  ) RETURNING id INTO _invite_id;

  RETURN json_build_object(
    'id', _invite_id,
    'token', _token,
    'child_id', _child_id,
    'expires_at', (SELECT expires_at FROM invites WHERE id = _invite_id)
  );
END;
$$;

-- RPC: Accept child invite and create account
CREATE OR REPLACE FUNCTION accept_child_invite(
  _token text,
  _username text,
  _email text,
  _password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _invite_record RECORD;
  _user_id uuid;
  _family_id uuid;
  _child_id uuid;
BEGIN
  -- Find invite
  SELECT * INTO _invite_record
  FROM invites
  WHERE token = _token
    AND role = 'child'
    AND expires_at > now()
    AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite token';
  END IF;

  _family_id := _invite_record.family_id;
  _child_id := _invite_record.child_id;

  -- Note: User creation happens in backend/auth, this just links
  -- Return the invite data for backend to use
  RETURN json_build_object(
    'invite_id', _invite_record.id,
    'child_id', _child_id,
    'family_id', _family_id,
    'email', _email,
    'username', _username
  );
END;
$$;

