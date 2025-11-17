-- Grant permissions to service_role for subject table
-- Needed for /year/prefill endpoint to fetch subject names

GRANT SELECT ON subject TO service_role;

-- Verify grant
SELECT 
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'service_role'
    AND table_name = 'subject'
ORDER BY privilege_type;

