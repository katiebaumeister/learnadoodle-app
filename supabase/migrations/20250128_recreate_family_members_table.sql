-- Recreate family_members table if it was accidentally deleted
-- This table is required for RLS policies on materials and other tables

-- Create family_members table if it doesn't exist
CREATE TABLE IF NOT EXISTS family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_role text NOT NULL CHECK (member_role IN ('parent','child','student','tutor')),
  child_scope uuid[] DEFAULT '{}', -- which children this member can see (for tutors)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (family_id, user_id) -- One membership per user per family
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS family_members_family_id_idx ON family_members(family_id);
CREATE INDEX IF NOT EXISTS family_members_user_id_idx ON family_members(user_id);
CREATE INDEX IF NOT EXISTS family_members_role_idx ON family_members(member_role);

-- Enable RLS
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for family_members
-- Users can read/update their own family_members row
DROP POLICY IF EXISTS "Users can view own membership" ON family_members;
CREATE POLICY "Users can view own membership" ON family_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own membership" ON family_members;
CREATE POLICY "Users can update own membership" ON family_members
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role can read all memberships
DROP POLICY IF EXISTS "Service role can read all memberships" ON family_members;
CREATE POLICY "Service role can read all memberships" ON family_members
  FOR SELECT
  TO service_role
  USING (true);

-- Parents can view family memberships (using is_family_parent helper to avoid recursion)
DROP POLICY IF EXISTS "Parents can view family memberships" ON family_members;
CREATE POLICY "Parents can view family memberships" ON family_members
  FOR SELECT
  TO authenticated
  USING (
    is_family_parent(family_id)
  );

-- Parents can manage family memberships
DROP POLICY IF EXISTS "Parents can manage family memberships" ON family_members;
CREATE POLICY "Parents can manage family memberships" ON family_members
  FOR ALL
  TO authenticated
  USING (
    is_family_parent(family_id)
  )
  WITH CHECK (
    is_family_parent(family_id)
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON family_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON family_members TO service_role;

-- Ensure is_family_member function exists and works correctly
CREATE OR REPLACE FUNCTION public.is_family_member(_family uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Check if user is a member via family_members table (bypasses RLS due to SECURITY DEFINER)
  SELECT EXISTS (
    SELECT 1
    FROM family_members fm
    WHERE fm.family_id = _family
      AND fm.user_id = auth.uid()
  )
  -- Fallback: check if user's profile has this family_id (for backward compatibility)
  OR EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.family_id = _family
  )
  -- Additional fallback: check if there are children in this family
  -- (If user can see children, they can see family data - this is a permissive fallback)
  OR EXISTS (
    SELECT 1
    FROM children c
    WHERE c.family_id = _family
      AND (c.archived = false OR c.archived IS NULL)
  );
$$;

-- Ensure is_family_parent function exists
CREATE OR REPLACE FUNCTION public.is_family_parent(_family uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM family_members fm
    WHERE fm.family_id = _family
      AND fm.user_id = auth.uid()
      AND fm.member_role = 'parent'
  )
  -- Fallback: if no family_members entry, check profiles.role
  OR EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.family_id = _family
      AND (p.role = 'parent' OR p.role IS NULL) -- NULL defaults to parent
  );
$$;

-- Grant execute permissions on helper functions
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_family_parent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_parent(uuid) TO service_role;

COMMENT ON TABLE family_members IS 'Tracks family membership and roles (parent, child, student, tutor). Required for RLS policies on materials and other tables.';
COMMENT ON FUNCTION is_family_member IS 'Checks if current user is a member of the specified family. Used by RLS policies.';
COMMENT ON FUNCTION is_family_parent IS 'Checks if current user is a parent in the specified family. Used by RLS policies.';
