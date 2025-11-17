-- Grant explicit permissions to service_role for invites table
-- This ensures backend operations work correctly even if RLS policies have issues

-- First, ensure service_role has table-level permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON invites TO service_role;

-- Also grant to authenticated role (for frontend operations via RLS policies)
GRANT SELECT, INSERT, UPDATE ON invites TO authenticated;

-- Drop and recreate the service_role policy to ensure it's correct
DROP POLICY IF EXISTS "Service role can manage invites" ON invites;
CREATE POLICY "Service role can manage invites" ON invites
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Also ensure the existing "Parents can manage family invites" policy allows INSERT
-- Check if it exists and update it if needed
DO $$
BEGIN
  -- Drop the existing policy if it exists
  DROP POLICY IF EXISTS "Parents can manage family invites" ON invites;
  
  -- Recreate it with explicit INSERT permission
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
END $$;

-- Verify grants were created
-- Run this to check:
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_name = 'invites'
-- ORDER BY grantee, privilege_type;

