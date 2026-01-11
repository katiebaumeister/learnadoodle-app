-- Grant explicit permissions to service_role for materials table
-- This ensures the service role can access materials when using the admin client

GRANT SELECT, INSERT, UPDATE, DELETE ON materials TO service_role;

-- Verify grant
SELECT 
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'service_role'
    AND table_name = 'materials'
ORDER BY privilege_type;

