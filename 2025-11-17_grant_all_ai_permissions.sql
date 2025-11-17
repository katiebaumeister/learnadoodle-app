-- Combined migration: Grant all permissions needed for AI features
-- Run this in Supabase SQL Editor

-- 1. Grant table permissions on ai_task_runs
grant select, insert, update on ai_task_runs to service_role;
grant select, insert, update on ai_task_runs to postgres;

-- 2. Grant RPC permissions on get_progress_snapshot
grant execute on function get_progress_snapshot(uuid, date, date) to service_role;

-- Verify permissions (optional - uncomment to check)
-- SELECT grantee, privilege_type 
-- FROM information_schema.role_table_grants 
-- WHERE table_name = 'ai_task_runs'
-- ORDER BY grantee, privilege_type;

