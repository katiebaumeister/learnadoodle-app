-- Fix RLS Policies for schedule_overrides
-- This script drops and recreates the policies using the same pattern as blackout_periods
-- schedule_overrides uses scope_type ('family' or 'child') and scope_id instead of direct family_id

-- Drop existing policies
DROP POLICY IF EXISTS schedule_overrides_select ON schedule_overrides;
DROP POLICY IF EXISTS schedule_overrides_insert ON schedule_overrides;
DROP POLICY IF EXISTS schedule_overrides_update ON schedule_overrides;
DROP POLICY IF EXISTS schedule_overrides_delete ON schedule_overrides;
DROP POLICY IF EXISTS schedule_overrides_service_role ON schedule_overrides;
DROP POLICY IF EXISTS "family_overrides_read" ON schedule_overrides;
DROP POLICY IF EXISTS "family_overrides_write" ON schedule_overrides;
DROP POLICY IF EXISTS "family_overrides_update" ON schedule_overrides;
DROP POLICY IF EXISTS "family_overrides_delete" ON schedule_overrides;
DROP POLICY IF EXISTS "Users can view schedule overrides for their families" ON schedule_overrides;
DROP POLICY IF EXISTS "Users can manage schedule overrides for their families" ON schedule_overrides;
DROP POLICY IF EXISTS "allow_all_read" ON schedule_overrides;
DROP POLICY IF EXISTS "allow_all_write" ON schedule_overrides;

-- Ensure RLS is enabled
ALTER TABLE schedule_overrides ENABLE ROW LEVEL SECURITY;

-- Create policies using is_family_member helper (if it exists)
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
    -- For family scope: scope_id is the family_id
    -- For child scope: need to check child's family_id
    EXECUTE '
      CREATE POLICY schedule_overrides_select ON schedule_overrides
        FOR SELECT USING (
          (scope_type = ''family'' AND is_family_member(scope_id))
          OR
          (scope_type = ''child'' AND scope_id IN (
            SELECT c.id FROM children c
            WHERE is_family_member(c.family_id)
          ))
        );
      
      CREATE POLICY schedule_overrides_insert ON schedule_overrides
        FOR INSERT WITH CHECK (
          (scope_type = ''family'' AND is_family_member(scope_id))
          OR
          (scope_type = ''child'' AND scope_id IN (
            SELECT c.id FROM children c
            WHERE is_family_member(c.family_id)
          ))
        );
      
      CREATE POLICY schedule_overrides_update ON schedule_overrides
        FOR UPDATE USING (
          (scope_type = ''family'' AND is_family_member(scope_id))
          OR
          (scope_type = ''child'' AND scope_id IN (
            SELECT c.id FROM children c
            WHERE is_family_member(c.family_id)
          ))
        )
        WITH CHECK (
          (scope_type = ''family'' AND is_family_member(scope_id))
          OR
          (scope_type = ''child'' AND scope_id IN (
            SELECT c.id FROM children c
            WHERE is_family_member(c.family_id)
          ))
        );
      
      CREATE POLICY schedule_overrides_delete ON schedule_overrides
        FOR DELETE USING (
          (scope_type = ''family'' AND is_family_member(scope_id))
          OR
          (scope_type = ''child'' AND scope_id IN (
            SELECT c.id FROM children c
            WHERE is_family_member(c.family_id)
          ))
        );

      CREATE POLICY schedule_overrides_service_role ON schedule_overrides
        FOR ALL USING (auth.role() = ''service_role'')
        WITH CHECK (auth.role() = ''service_role'');
    ';
  ELSE
    -- Fallback: use direct profile check
    EXECUTE '
      CREATE POLICY schedule_overrides_select ON schedule_overrides
        FOR SELECT USING (
          (scope_type = ''family'' AND scope_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
          ))
          OR
          (scope_type = ''child'' AND scope_id IN (
            SELECT c.id FROM children c
            JOIN family f ON c.family_id = f.id
            JOIN profiles p ON f.id = p.family_id
            WHERE p.id = auth.uid()
          ))
        );
      
      CREATE POLICY schedule_overrides_insert ON schedule_overrides
        FOR INSERT WITH CHECK (
          (scope_type = ''family'' AND scope_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
          ))
          OR
          (scope_type = ''child'' AND scope_id IN (
            SELECT c.id FROM children c
            JOIN family f ON c.family_id = f.id
            JOIN profiles p ON f.id = p.family_id
            WHERE p.id = auth.uid()
          ))
        );
      
      CREATE POLICY schedule_overrides_update ON schedule_overrides
        FOR UPDATE USING (
          (scope_type = ''family'' AND scope_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
          ))
          OR
          (scope_type = ''child'' AND scope_id IN (
            SELECT c.id FROM children c
            JOIN family f ON c.family_id = f.id
            JOIN profiles p ON f.id = p.family_id
            WHERE p.id = auth.uid()
          ))
        )
        WITH CHECK (
          (scope_type = ''family'' AND scope_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
          ))
          OR
          (scope_type = ''child'' AND scope_id IN (
            SELECT c.id FROM children c
            JOIN family f ON c.family_id = f.id
            JOIN profiles p ON f.id = p.family_id
            WHERE p.id = auth.uid()
          ))
        );
      
      CREATE POLICY schedule_overrides_delete ON schedule_overrides
        FOR DELETE USING (
          (scope_type = ''family'' AND scope_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
          ))
          OR
          (scope_type = ''child'' AND scope_id IN (
            SELECT c.id FROM children c
            JOIN family f ON c.family_id = f.id
            JOIN profiles p ON f.id = p.family_id
            WHERE p.id = auth.uid()
          ))
        );

      CREATE POLICY schedule_overrides_service_role ON schedule_overrides
        FOR ALL USING (auth.role() = ''service_role'')
        WITH CHECK (auth.role() = ''service_role'');
    ';
  END IF;
END $$;

-- Ensure is_family_member is accessible (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'is_family_member' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION is_family_member(uuid) TO authenticated';
  END IF;
END $$;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON schedule_overrides TO authenticated;

-- Verify policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'schedule_overrides'
ORDER BY policyname;
