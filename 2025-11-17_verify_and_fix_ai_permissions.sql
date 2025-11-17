-- Verify and fix permissions for ai_task_runs table
-- Run this in Supabase SQL Editor

-- 1. Check current permissions
SELECT 
    grantee, 
    privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'ai_task_runs'
ORDER BY grantee, privilege_type;

-- 2. Grant permissions if missing
DO $$
BEGIN
    -- Grant to service_role
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants 
        WHERE table_name = 'ai_task_runs' 
        AND grantee = 'service_role' 
        AND privilege_type = 'INSERT'
    ) THEN
        GRANT SELECT, INSERT, UPDATE ON ai_task_runs TO service_role;
        RAISE NOTICE 'Granted permissions to service_role';
    ELSE
        RAISE NOTICE 'service_role already has permissions';
    END IF;
    
    -- Grant to postgres
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants 
        WHERE table_name = 'ai_task_runs' 
        AND grantee = 'postgres' 
        AND privilege_type = 'INSERT'
    ) THEN
        GRANT SELECT, INSERT, UPDATE ON ai_task_runs TO postgres;
        RAISE NOTICE 'Granted permissions to postgres';
    ELSE
        RAISE NOTICE 'postgres already has permissions';
    END IF;
END $$;

-- 3. Verify RPC permissions
SELECT 
    routine_name,
    routine_type,
    security_type
FROM information_schema.routines
WHERE routine_name = 'get_progress_snapshot';

-- 4. Test insert (should work after grants)
-- Uncomment to test:
-- INSERT INTO ai_task_runs (family_id, kind, params, status)
-- VALUES (
--     '00000000-0000-0000-0000-000000000000'::uuid,
--     'summarize_progress',
--     '{"test": true}'::jsonb,
--     'pending'
-- );
-- DELETE FROM ai_task_runs WHERE family_id = '00000000-0000-0000-0000-000000000000'::uuid;

