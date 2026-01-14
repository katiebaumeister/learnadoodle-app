-- Fix permissions for curriculum tables
-- Grant explicit permissions to service_role to ensure backend can insert/update/delete
-- This is needed even though service role should bypass RLS

-- Grant permissions on curriculum tables to service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON curriculum_units TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON curriculum_lessons TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON curriculum_pacing TO service_role;

-- Grant usage on sequences (for UUID generation)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Verify grants were applied
SELECT 
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'service_role'
    AND table_name IN ('curriculum_units', 'curriculum_lessons', 'curriculum_pacing')
ORDER BY table_name, privilege_type;




