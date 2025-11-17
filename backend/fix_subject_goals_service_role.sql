-- Fix subject_goals and syllabi permissions for service_role
-- This allows the FastAPI backend to query these tables when loading planning context

-- Grant permissions on subject_goals (might be queried indirectly or via joins)
GRANT SELECT ON subject_goals TO service_role;

-- Grant permissions on syllabi (needed for get_required_minutes RPC)
GRANT SELECT ON syllabi TO service_role;

-- Verify grants
SELECT 
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'service_role'
    AND table_name IN ('subject_goals', 'syllabi')
ORDER BY table_name, privilege_type;

