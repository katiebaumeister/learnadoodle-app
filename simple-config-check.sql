-- Simple Supabase Configuration Check
-- This script will help us understand the database setup

-- 1. Check current user
SELECT 'CURRENT USER:' as info;
SELECT current_user, session_user;

-- 2. Check if tables exist
SELECT 'TABLE EXISTENCE:' as info;
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_name IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance', 'typical_holidays')
ORDER BY table_name;

-- 3. Check RLS status using a simpler approach
SELECT 'RLS STATUS:' as info;
SELECT 
    c.relname as table_name,
    CASE WHEN c.relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as rls_status
FROM pg_class c
WHERE c.relname IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance', 'typical_holidays')
AND c.relkind = 'r'
ORDER BY c.relname;

-- 4. Check existing policies
SELECT 'EXISTING POLICIES:' as info;
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance', 'typical_holidays')
ORDER BY tablename, policyname;

-- 5. Test basic table access
SELECT 'BASIC ACCESS TEST:' as info;
SELECT 'academic_years' as table_name, COUNT(*) as count FROM academic_years
UNION ALL
SELECT 'typical_holidays' as table_name, COUNT(*) as count FROM typical_holidays
UNION ALL
SELECT 'holidays' as table_name, COUNT(*) as count FROM holidays
UNION ALL
SELECT 'class_days' as table_name, COUNT(*) as count FROM class_days
UNION ALL
SELECT 'class_day_mappings' as table_name, COUNT(*) as count FROM class_day_mappings
UNION ALL
SELECT 'lessons' as table_name, COUNT(*) as count FROM lessons
UNION ALL
SELECT 'attendance' as table_name, COUNT(*) as count FROM attendance;

SELECT 'Simple configuration check completed!' as status; 