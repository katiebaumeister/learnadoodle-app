-- Check the exact structure of the lessons table
-- This will show us all columns and their constraints

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

-- Check if there are any existing lessons to see the structure
SELECT 'Sample Lessons Data:' as info;
SELECT * FROM lessons LIMIT 1;

-- Check table constraints
SELECT 'Table Constraints:' as info;
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    tc.is_deferrable,
    tc.initially_deferred
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'lessons'
AND tc.table_schema = 'public';
