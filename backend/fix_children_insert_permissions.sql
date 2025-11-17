-- Grant INSERT permission on children table to service_role
-- This allows the FastAPI backend to create child records during onboarding

-- Grant INSERT permission on children table
GRANT INSERT ON children TO service_role;

-- Also grant UPDATE and DELETE in case we need to edit/remove children later
GRANT UPDATE, DELETE ON children TO service_role;

-- Verify grants
SELECT 
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'service_role'
    AND table_name = 'children'
ORDER BY privilege_type;

