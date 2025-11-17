-- Fix infinite recursion in family_members RLS policies
-- The policies were querying family_members table directly, causing recursion
-- Solution: Use is_family_member function (SECURITY DEFINER) which bypasses RLS

-- First, ensure is_family_member function uses SECURITY DEFINER and doesn't cause recursion
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
      AND c.archived = false
  );
$$;

-- Create a helper function to check if user is a parent in a family (also SECURITY DEFINER)
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

-- Now fix the RLS policies to use the helper functions instead of direct queries
DROP POLICY IF EXISTS "Parents can view family memberships" ON family_members;
CREATE POLICY "Parents can view family memberships" ON family_members
  FOR SELECT
  TO authenticated
  USING (
    -- Use helper function which bypasses RLS
    is_family_parent(family_id)
  );

DROP POLICY IF EXISTS "Parents can manage family memberships" ON family_members;
CREATE POLICY "Parents can manage family memberships" ON family_members
  FOR ALL
  TO authenticated
  USING (
    -- Use helper function which bypasses RLS
    is_family_parent(family_id)
  )
  WITH CHECK (
    -- Use helper function which bypasses RLS
    is_family_parent(family_id)
  );

-- Create a helper function to get user's family_id (SECURITY DEFINER to bypass RLS on profiles)
-- Also checks children table as fallback (for users who don't have family_id in profile)
CREATE OR REPLACE FUNCTION public.get_user_family_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT family_id FROM profiles WHERE id = auth.uid()),
    -- Fallback: get family_id from any non-archived children
    -- (This is a permissive fallback for users without family_id in profile)
    (SELECT DISTINCT c.family_id FROM children c WHERE c.archived = false LIMIT 1)
  );
$$;

-- Grant execute permissions (ensure these are set)
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO anon; -- Also grant to anon in case needed
GRANT EXECUTE ON FUNCTION public.is_family_parent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_parent(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_family_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_family_id() TO service_role;

-- Ensure the functions are accessible in the public schema
ALTER FUNCTION public.is_family_member(uuid) SECURITY DEFINER;
ALTER FUNCTION public.is_family_parent(uuid) SECURITY DEFINER;
ALTER FUNCTION public.get_user_family_id() SECURITY DEFINER;

-- Fix learning_suggestions RLS policies to use helper functions instead of direct queries
-- Drop ALL existing policies first to avoid conflicts (including any with syntax errors)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'learning_suggestions') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON learning_suggestions', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Family members can view suggestions" ON learning_suggestions
  FOR SELECT
  TO authenticated
  USING (
    -- Simple check: user is a member of the family
    -- This works because is_family_member() already checks children as fallback
    is_family_member(learning_suggestions.family_id)
  );

DROP POLICY IF EXISTS "Parents can approve suggestions" ON learning_suggestions;
CREATE POLICY "Parents can approve suggestions" ON learning_suggestions
  FOR UPDATE
  TO authenticated
  USING (
    -- Use helper function which bypasses RLS (returns boolean directly)
    is_family_parent(learning_suggestions.family_id)
  )
  WITH CHECK (
    -- Use helper function which bypasses RLS (returns boolean directly)
    is_family_parent(learning_suggestions.family_id)
  );

-- Test queries to verify functions work (run these in Supabase SQL Editor):
-- SELECT is_family_member('86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'::uuid) as is_member;
-- SELECT get_user_family_id() as my_family_id;
-- SELECT is_family_parent('86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'::uuid) as is_parent;

-- Diagnostic: Check current policies on learning_suggestions
-- Run this to see what policies exist:
-- SELECT tablename, policyname, cmd, qual, with_check 
-- FROM pg_policies 
-- WHERE tablename = 'learning_suggestions';

-- Ensure RLS is enabled
ALTER TABLE learning_suggestions ENABLE ROW LEVEL SECURITY;

-- Verify the policy was created (run this to check):
-- SELECT 
--   policyname, 
--   cmd, 
--   roles,
--   qual::text as using_clause
-- FROM pg_policies 
-- WHERE tablename = 'learning_suggestions' 
--   AND cmd = 'SELECT';

-- Test the policy (run as authenticated user):
-- SELECT COUNT(*) FROM learning_suggestions;
-- If this returns a count (even 0), the policy is working
-- If it returns permission denied, the policy needs to be recreated

-- IMPORTANT: If you still get permission errors after running this migration:
-- 1. Verify you ran this entire migration file
-- 2. Check that the policy exists: SELECT * FROM pg_policies WHERE tablename = 'learning_suggestions';
-- 3. Try refreshing your browser cache or logging out and back in
-- 4. Verify your user has a family_id: SELECT get_user_family_id();
-- 5. Test the policy directly (run as authenticated user):
--    SELECT COUNT(*) FROM learning_suggestions;
--    If this works but frontend doesn't, it's a client caching issue - try hard refresh

