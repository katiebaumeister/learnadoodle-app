-- Migration: Ensure Role-Based Access Control is properly set up
-- This migration verifies and fixes the database structure for role-based access
-- where parents and children use individual emails but share a family_id

-- ============================================================
-- 1. Verify profiles table has required columns
-- ============================================================

DO $$
BEGIN
  -- Ensure family_id column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'family_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN family_id UUID REFERENCES family(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS profiles_family_id_idx ON profiles(family_id);
  END IF;

  -- Ensure role column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE profiles 
    ADD COLUMN role text
      CHECK (role IN ('parent','child','student','tutor'))
      DEFAULT 'parent';
    CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles(role) WHERE role IS NOT NULL;
  END IF;
END $$;

-- ============================================================
-- 2. Verify family_members table exists and has required columns
-- ============================================================

-- This should already exist from previous migrations, but verify
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'family_members'
  ) THEN
    CREATE TABLE family_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      member_role text NOT NULL CHECK (member_role IN ('parent','child','student','tutor')),
      child_scope uuid[] DEFAULT '{}',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE (family_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS family_members_family_id_idx ON family_members(family_id);
    CREATE INDEX IF NOT EXISTS family_members_user_id_idx ON family_members(user_id);
    CREATE INDEX IF NOT EXISTS family_members_role_idx ON family_members(member_role);

    ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ============================================================
-- 3. Add child_id column to family_members (OPTIONAL - for explicit linking)
-- ============================================================

-- This makes the user→child relationship more explicit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'family_members' AND column_name = 'child_id'
  ) THEN
    ALTER TABLE family_members 
    ADD COLUMN child_id UUID REFERENCES children(id) ON DELETE CASCADE;
    
    CREATE INDEX IF NOT EXISTS family_members_child_id_idx ON family_members(child_id);
    
    COMMENT ON COLUMN family_members.child_id IS 
      'Direct link to child record. Set for child/student roles, NULL for parent/tutor roles.';
  END IF;
END $$;

-- ============================================================
-- 4. Populate child_id from child_scope for existing records
-- ============================================================

-- For existing child/student accounts, extract child_id from child_scope array
UPDATE family_members
SET child_id = child_scope[1]  -- Use first element of array
WHERE member_role IN ('child', 'student')
  AND child_id IS NULL
  AND array_length(child_scope, 1) > 0;

-- ============================================================
-- 5. Ensure get_accessible_children function exists and works correctly
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_accessible_children(_user_id uuid)
RETURNS TABLE(child_id uuid, family_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- If user is a parent, return all children in their family
  SELECT DISTINCT c.id AS child_id, c.family_id
  FROM children c
  JOIN family_members fm ON fm.family_id = c.family_id
  WHERE fm.user_id = _user_id
    AND fm.member_role = 'parent'
    AND c.archived = false
  
  UNION
  
  -- If user is a tutor, return only children in their child_scope
  SELECT DISTINCT unnest(fm.child_scope) AS child_id, fm.family_id
  FROM family_members fm
  WHERE fm.user_id = _user_id
    AND fm.member_role = 'tutor'
    AND array_length(fm.child_scope, 1) > 0
  
  UNION
  
  -- If user is a child/student, return only themselves
  -- First try using child_id column (if it exists)
  SELECT DISTINCT COALESCE(fm.child_id, fm.child_scope[1]) AS child_id, fm.family_id
  FROM family_members fm
  WHERE fm.user_id = _user_id
    AND fm.member_role IN ('child', 'student')
    AND (fm.child_id IS NOT NULL OR array_length(fm.child_scope, 1) > 0)
  
  -- Fallback: if no family_members entry, check profiles.family_id (backward compatibility)
  UNION
  SELECT DISTINCT c.id AS child_id, c.family_id
  FROM children c
  JOIN profiles p ON p.family_id = c.family_id
  WHERE p.id = _user_id
    AND c.archived = false
    AND NOT EXISTS (
      SELECT 1 FROM family_members fm WHERE fm.user_id = _user_id
    );
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_accessible_children(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_accessible_children(uuid) TO service_role;

-- ============================================================
-- 6. Create helper function to get child_id for a user
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_child_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- For child/student roles, return their child_id
  SELECT COALESCE(fm.child_id, fm.child_scope[1])
  FROM family_members fm
  WHERE fm.user_id = _user_id
    AND fm.member_role IN ('child', 'student')
    AND (fm.child_id IS NOT NULL OR array_length(fm.child_scope, 1) > 0)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_child_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_child_id(uuid) TO service_role;

-- ============================================================
-- 7. Add comments for documentation
-- ============================================================

COMMENT ON TABLE family_members IS 
  'Tracks family membership and roles. For child/student accounts, child_scope or child_id must link to the children table.';

COMMENT ON COLUMN family_members.child_scope IS 
  'Array of child IDs this member can access. For child/student roles, should contain their own child ID.';

COMMENT ON COLUMN family_members.child_id IS 
  'Direct link to child record. Set for child/student roles (links user account to child record), NULL for parent/tutor.';

COMMENT ON FUNCTION get_accessible_children IS 
  'Returns accessible children for a user based on their role. Parents see all family children, children see only themselves.';

COMMENT ON FUNCTION get_user_child_id IS 
  'Returns the child_id for a user with child/student role. Returns NULL if user is not a child/student.';

-- ============================================================
-- 8. Verification queries (for manual checking)
-- ============================================================

-- Uncomment to run verification:
-- SELECT 
--   'Total family_members entries' as check_type,
--   COUNT(*) as count
-- FROM family_members
-- UNION ALL
-- SELECT 
--   'Child/student accounts with child_id set' as check_type,
--   COUNT(*) as count
-- FROM family_members
-- WHERE member_role IN ('child', 'student') AND child_id IS NOT NULL
-- UNION ALL
-- SELECT 
--   'Child/student accounts with child_scope set' as check_type,
--   COUNT(*) as count
-- FROM family_members
-- WHERE member_role IN ('child', 'student') 
--   AND array_length(child_scope, 1) > 0
-- UNION ALL
-- SELECT 
--   'Child/student accounts missing child link' as check_type,
--   COUNT(*) as count
-- FROM family_members
-- WHERE member_role IN ('child', 'student')
--   AND child_id IS NULL
--   AND (child_scope IS NULL OR array_length(child_scope, 1) = 0);
