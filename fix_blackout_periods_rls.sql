-- Fix RLS Policies for blackout_periods
-- The existing policies may be failing because they reference profiles table incorrectly
-- This script drops and recreates the policies using helper functions

-- Drop existing policies
DROP POLICY IF EXISTS blackout_periods_select ON blackout_periods;
DROP POLICY IF EXISTS blackout_periods_all ON blackout_periods;
DROP POLICY IF EXISTS blackout_periods_insert ON blackout_periods;
DROP POLICY IF EXISTS blackout_periods_update ON blackout_periods;
DROP POLICY IF EXISTS blackout_periods_delete ON blackout_periods;

-- Ensure RLS is enabled
ALTER TABLE blackout_periods ENABLE ROW LEVEL SECURITY;

-- Create SELECT policy using is_family_member helper (if it exists)
-- Otherwise use a direct check
DO $$
BEGIN
  -- Check if is_family_member function exists
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'is_family_member' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    -- Use helper function
    EXECUTE '
      CREATE POLICY blackout_periods_select ON blackout_periods
        FOR SELECT USING (is_family_member(family_id));
      
      CREATE POLICY blackout_periods_insert ON blackout_periods
        FOR INSERT WITH CHECK (is_family_member(family_id));
      
      CREATE POLICY blackout_periods_update ON blackout_periods
        FOR UPDATE USING (is_family_member(family_id))
        WITH CHECK (is_family_member(family_id));
      
      CREATE POLICY blackout_periods_delete ON blackout_periods
        FOR DELETE USING (is_family_member(family_id));
    ';
  ELSE
    -- Fallback: use direct profile check
    EXECUTE '
      CREATE POLICY blackout_periods_select ON blackout_periods
        FOR SELECT USING (
          family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
          )
        );
      
      CREATE POLICY blackout_periods_insert ON blackout_periods
        FOR INSERT WITH CHECK (
          family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
          )
        );
      
      CREATE POLICY blackout_periods_update ON blackout_periods
        FOR UPDATE USING (
          family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
          )
        )
        WITH CHECK (
          family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
          )
        );
      
      CREATE POLICY blackout_periods_delete ON blackout_periods
        FOR DELETE USING (
          family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
          )
        );
    ';
  END IF;
END $$;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON blackout_periods TO authenticated;

-- Verify policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'blackout_periods'
ORDER BY policyname;

