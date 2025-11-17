-- Grant explicit permissions to service_role for family_members table
-- This ensures backend operations work correctly even if RLS policies have issues

-- Grant all necessary permissions to service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON family_members TO service_role;

-- Also grant to authenticated role (for frontend operations via RLS policies)
GRANT SELECT, INSERT, UPDATE ON family_members TO authenticated;

-- Verify grants were created
-- Run this to check:
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_name = 'family_members'
-- ORDER BY grantee, privilege_type;

