-- Grant permissions on attendance_exceptions table to service_role
-- This fixes permission errors when completing events that trigger attendance updates

-- Grant SELECT, INSERT, UPDATE, DELETE permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON attendance_exceptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON attendance_exceptions TO postgres;

-- Verify permissions
SELECT 
  grantee, 
  privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'attendance_exceptions' 
  AND grantee IN ('service_role', 'postgres');

