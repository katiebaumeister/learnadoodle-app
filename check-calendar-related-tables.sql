-- Check Calendar-Related Tables
-- This will help determine what tables you need and what's already covered

-- Check what calendar/class/day tables exist
SELECT '=== EXISTING CALENDAR TABLES ===' as info;
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_name LIKE '%calendar%' 
   OR table_name LIKE '%class%'
   OR table_name LIKE '%day%'
   OR table_name LIKE '%track%'
   OR table_name LIKE '%subject%'
AND table_schema = 'public'
ORDER BY table_name;

-- Check current data in each table
SELECT '=== CURRENT DATA COUNTS ===' as info;
SELECT 'calendar_days' as table_name, COUNT(*) as count FROM calendar_days
UNION ALL
SELECT 'class_days', COUNT(*) FROM class_days
UNION ALL
SELECT 'class_day_mappings', COUNT(*) FROM class_day_mappings
UNION ALL
SELECT 'holidays', COUNT(*) FROM holidays
UNION ALL
SELECT 'subject', COUNT(*) FROM subject
UNION ALL
SELECT 'subject_track', COUNT(*) FROM subject_track
UNION ALL
SELECT 'track', COUNT(*) FROM track;

-- Check structure of key tables
SELECT '=== CALENDAR_DAYS STRUCTURE ===' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'calendar_days' 
ORDER BY ordinal_position;

SELECT '=== CLASS_DAYS STRUCTURE ===' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'class_days' 
ORDER BY ordinal_position;

SELECT '=== SUBJECT_TRACK STRUCTURE ===' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'subject_track' 
ORDER BY ordinal_position;
