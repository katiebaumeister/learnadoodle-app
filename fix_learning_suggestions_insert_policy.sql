-- Fix learning_suggestions RLS policies to allow inserts from backend
-- The backend uses service_role which should bypass RLS, but we also need
-- INSERT policy for authenticated users in case backend uses authenticated context

-- Drop all existing policies on learning_suggestions
DO $$ 
DECLARE 
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'learning_suggestions') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON learning_suggestions', r.policyname);
  END LOOP;
END $$;

-- Service role can do everything (for backend operations)
CREATE POLICY "Service role can manage suggestions" ON learning_suggestions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can INSERT suggestions for their family
CREATE POLICY "Authenticated users can insert suggestions" ON learning_suggestions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- User must be a member of the family
    is_family_member(learning_suggestions.family_id)
  );

-- Family members can view suggestions for their family
CREATE POLICY "Family members can view suggestions" ON learning_suggestions
  FOR SELECT
  TO authenticated
  USING (
    -- User must be a member of the family
    is_family_member(learning_suggestions.family_id)
  );

-- Only parents can approve suggestions
CREATE POLICY "Parents can approve suggestions" ON learning_suggestions
  FOR UPDATE
  TO authenticated
  USING (
    -- User must be a parent in the family
    is_family_parent(learning_suggestions.family_id)
  )
  WITH CHECK (
    -- User must be a parent in the family
    is_family_parent(learning_suggestions.family_id)
  );

-- Ensure RLS is enabled
ALTER TABLE learning_suggestions ENABLE ROW LEVEL SECURITY;

-- Grant explicit permissions to service_role (for backend operations)
-- Even though service_role should bypass RLS, explicit grants ensure it works
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_suggestions TO service_role;

-- Grant permissions to authenticated role (for frontend operations)
GRANT SELECT, INSERT, UPDATE ON learning_suggestions TO authenticated;

-- Verify policies were created
-- Run this to check:
-- SELECT tablename, policyname, cmd, roles
-- FROM pg_policies 
-- WHERE tablename = 'learning_suggestions'
-- ORDER BY cmd, policyname;

-- Verify grants were created
-- Run this to check:
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_name = 'learning_suggestions'
-- ORDER BY grantee, privilege_type;

