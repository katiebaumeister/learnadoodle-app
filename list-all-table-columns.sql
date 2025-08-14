-- List All Table Columns
-- This will show us the complete database structure and how tables connect

-- Get all tables first
SELECT '=== ALL TABLES IN DATABASE ===' as info;
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Now check columns for each table systematically
-- Core tables
SELECT '=== FAMILY TABLE ===' as table_info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'family' 
ORDER BY ordinal_position;

SELECT '=== CHILDREN TABLE ===' as table_info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'children' 
ORDER BY ordinal_position;

SELECT '=== ACADEMIC_YEARS TABLE ===' as table_info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'academic_years' 
ORDER BY ordinal_position;

SELECT '=== SUBJECT TABLE ===' as table_info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'subject' 
ORDER BY ordinal_position;

-- Calendar/Planning tables
SELECT '=== LESSONS TABLE ===' as table_info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'lessons' 
ORDER BY ordinal_position;

SELECT '=== ATTENDANCE TABLE ===' as table_info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'attendance' 
ORDER BY ordinal_position;

SELECT '=== HOLIDAYS TABLE ===' as table_info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'holidays' 
ORDER BY ordinal_position;

SELECT '=== CLASS_DAYS TABLE ===' as table_info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'class_days' 
ORDER BY ordinal_position;

SELECT '=== CLASS_DAY_MAPPINGS TABLE ===' as table_info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'class_day_mappings' 
ORDER BY ordinal_position;

-- Additional tables that might exist
SELECT '=== SUBJECT_TRACK TABLE ===' as table_info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'subject_track' 
ORDER BY ordinal_position;

SELECT '=== TRACK TABLE ===' as table_info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'track' 
ORDER BY ordinal_position;

-- Check for any other tables we might have missed
SELECT '=== OTHER TABLES ===' as table_info;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
AND table_name NOT IN (
    'family', 'children', 'academic_years', 'subject', 
    'lessons', 'attendance', 'holidays', 'class_days', 
    'class_day_mappings', 'subject_track', 'track'
)
ORDER BY table_name;
