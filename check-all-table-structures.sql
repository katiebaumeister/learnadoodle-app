-- Check the structure of all tables we want to add
-- This will show us the exact columns and constraints

-- Check lessons table structure
SELECT 'Lessons Table Structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default,
    CASE WHEN is_nullable = 'NO' THEN 'REQUIRED' ELSE 'OPTIONAL' END as required_status
FROM information_schema.columns 
WHERE table_name = 'lessons' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check attendance table structure
SELECT 'Attendance Table Structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default,
    CASE WHEN is_nullable = 'NO' THEN 'REQUIRED' ELSE 'OPTIONAL' END as required_status
FROM information_schema.columns 
WHERE table_name = 'attendance' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check holidays table structure
SELECT 'Holidays Table Structure:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default,
    CASE WHEN is_nullable = 'NO' THEN 'REQUIRED' ELSE 'OPTIONAL' END as required_status
FROM information_schema.columns 
WHERE table_name = 'holidays' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if there are calendar/class days tables
SELECT 'Calendar/Class Days Tables:' as info;
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_name LIKE '%calendar%' 
   OR table_name LIKE '%class%'
   OR table_name LIKE '%day%'
AND table_schema = 'public'
ORDER BY table_name;

-- Check any existing data in these tables
SELECT 'Sample Data Check:' as info;
SELECT 'Lessons count:' as table_name, COUNT(*) as count FROM lessons
UNION ALL
SELECT 'Attendance count:', COUNT(*) FROM attendance
UNION ALL
SELECT 'Holidays count:', COUNT(*) FROM holidays;
