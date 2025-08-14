-- Test Table Access - Simple Verification
-- This script will test if we can actually access the tables

-- 1. Check current RLS status
SELECT 'CURRENT RLS STATUS:' as info;
SELECT 
    schemaname,
    tablename,
    CASE WHEN relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as rls_status
FROM pg_tables t
JOIN pg_class c ON t.tablename = c.relname
WHERE tablename IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance', 'typical_holidays')
ORDER BY tablename;

-- 2. Check existing policies
SELECT 'EXISTING POLICIES:' as info;
SELECT schemaname, tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance', 'typical_holidays')
ORDER BY tablename, policyname;

-- 3. Test direct table access
SELECT 'TESTING TABLE ACCESS:' as info;

-- Test academic_years
SELECT 'academic_years - can select:' as test, COUNT(*) as count FROM academic_years;

-- Test typical_holidays
SELECT 'typical_holidays - can select:' as test, COUNT(*) as count FROM typical_holidays;

-- 4. Test insert capability
SELECT 'TESTING INSERT CAPABILITY:' as info;

-- Try to insert a test record
INSERT INTO academic_years (family_id, year_name, start_date, end_date, is_current)
VALUES ('86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', 'Access Test', '2024-01-01', '2024-12-31', false)
ON CONFLICT DO NOTHING;

SELECT 'Insert test completed!' as result;

-- 5. Clean up test record
DELETE FROM academic_years WHERE year_name = 'Access Test';

SELECT 'Cleanup completed!' as result;

-- 6. Show final table counts
SELECT 'FINAL TABLE COUNTS:' as info;
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

SELECT 'Table access test completed!' as status; 