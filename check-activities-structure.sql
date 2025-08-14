-- Check Activities Table Structure
-- This script shows the exact columns in the activities table

SELECT '=== ACTIVITIES TABLE STRUCTURE ===' as info;

-- Check the exact columns in the activities table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'activities'
ORDER BY ordinal_position;

-- Check existing data to see what columns are populated
SELECT '=== EXISTING DATA SAMPLE ===' as info;

SELECT 
    'Sample Record:' as test,
    *
FROM activities
LIMIT 1;

-- Check if there are any activities for your family
SELECT '=== FAMILY ACTIVITIES CHECK ===' as info;

-- Try to find activities using different possible relationships
SELECT 
    'Activities Count:' as test,
    COUNT(*) as total_activities
FROM activities;

-- Check if there are any foreign key relationships
SELECT '=== FOREIGN KEY RELATIONSHIPS ===' as info;

SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name='activities';
