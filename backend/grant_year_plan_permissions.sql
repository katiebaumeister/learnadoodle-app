-- Grant permissions for year planning tables
-- Needed for /year/create endpoint RPC function (SECURITY DEFINER)
-- The RPC function runs with SECURITY DEFINER, so it needs INSERT permissions

-- First, check who owns the function
SELECT 
    p.proname as function_name,
    pg_get_userbyid(p.proowner) as function_owner
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'create_year_plan'
    AND n.nspname = 'public';

-- Ensure postgres role has all necessary permissions
-- Grant INSERT and SELECT permissions on year_plans table
GRANT INSERT, SELECT, UPDATE, DELETE ON year_plans TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE ON year_plans TO service_role;
GRANT INSERT, SELECT, UPDATE, DELETE ON year_plans TO authenticated;

-- Grant INSERT and SELECT permissions on year_plan_children table
GRANT INSERT, SELECT, UPDATE, DELETE ON year_plan_children TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE ON year_plan_children TO service_role;
GRANT INSERT, SELECT, UPDATE, DELETE ON year_plan_children TO authenticated;

-- Grant INSERT and SELECT permissions on term_milestones table
GRANT INSERT, SELECT, UPDATE, DELETE ON term_milestones TO postgres;
GRANT INSERT, SELECT, UPDATE, DELETE ON term_milestones TO service_role;
GRANT INSERT, SELECT, UPDATE, DELETE ON term_milestones TO authenticated;

-- Verify grants
SELECT 
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.role_table_grants
WHERE grantee IN ('service_role', 'postgres')
    AND table_name IN ('year_plans', 'year_plan_children', 'term_milestones')
ORDER BY grantee, table_name, privilege_type;

