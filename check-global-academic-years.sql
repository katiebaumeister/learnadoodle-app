-- Check the exact structure of global_academic_years table
-- This will show us what columns actually exist

SELECT '=== GLOBAL_ACADEMIC_YEARS STRUCTURE ===' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'global_academic_years' 
ORDER BY ordinal_position;

-- Also check if there's any existing data
SELECT '=== EXISTING GLOBAL_ACADEMIC_YEARS DATA ===' as info;
SELECT * FROM global_academic_years LIMIT 3;
