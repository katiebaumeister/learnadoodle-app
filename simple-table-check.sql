-- Simple Table Structure Check
-- This will show you exactly what columns exist in each table

-- Check lessons table
SELECT '=== LESSONS TABLE ===' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'lessons' 
ORDER BY ordinal_position;

-- Check attendance table  
SELECT '=== ATTENDANCE TABLE ===' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'attendance' 
ORDER BY ordinal_position;

-- Check holidays table
SELECT '=== HOLIDAYS TABLE ===' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'holidays' 
ORDER BY ordinal_position;

-- Check what tables exist with 'calendar' or 'class' or 'day' in the name
SELECT '=== CALENDAR/CLASS TABLES ===' as info;
SELECT table_name 
FROM information_schema.tables 
WHERE table_name LIKE '%calendar%' 
   OR table_name LIKE '%class%'
   OR table_name LIKE '%day%'
   AND table_schema = 'public';

-- Simple count check
SELECT '=== CURRENT DATA COUNTS ===' as info;
SELECT 'lessons' as table_name, COUNT(*) as count FROM lessons
UNION ALL
SELECT 'attendance', COUNT(*) FROM attendance  
UNION ALL
SELECT 'holidays', COUNT(*) FROM holidays;
