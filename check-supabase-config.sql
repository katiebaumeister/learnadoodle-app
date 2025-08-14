-- Check Supabase Configuration
-- This script will help us understand why RLS isn't working

-- 1. Check if we're connected as the right user
SELECT 'CURRENT USER:' as info;
SELECT current_user, session_user;

-- 2. Check if we have the right permissions
SELECT 'PERMISSIONS:' as info;
SELECT 
    schemaname,
    tablename,
    privilege_type,
    is_grantable
FROM information_schema.table_privileges 
WHERE table_name IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance', 'typical_holidays')
AND grantee = current_user
ORDER BY table_name, privilege_type;

-- 3. Check RLS status again
SELECT 'RLS STATUS:' as info;
SELECT 
    t.schemaname,
    t.tablename,
    CASE WHEN c.relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as rls_status
FROM pg_tables t
JOIN pg_class c ON t.tablename = c.relname AND t.schemaname = c.relnamespace::regnamespace::text
WHERE t.tablename IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance', 'typical_holidays')
ORDER BY t.tablename;

-- 4. Check if tables exist and are accessible
SELECT 'TABLE ACCESS:' as info;
SELECT 
    table_name,
    table_type,
    is_insertable_into,
    is_typed
FROM information_schema.tables 
WHERE table_name IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance', 'typical_holidays')
ORDER BY table_name;

-- 5. Try a simple test with explicit schema
SELECT 'EXPLICIT SCHEMA TEST:' as info;
SELECT COUNT(*) as academic_years_count FROM public.academic_years;
SELECT COUNT(*) as typical_holidays_count FROM public.typical_holidays;

-- 6. Check if there are any triggers or rules blocking access
SELECT 'TRIGGERS:' as info;
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance', 'typical_holidays')
ORDER BY event_object_table, trigger_name;

SELECT 'Configuration check completed!' as status; 