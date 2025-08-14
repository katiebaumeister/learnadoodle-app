-- Check the EXACT structure of class_days table
-- This will resolve the column mismatch issue

SELECT '=== CLASS_DAYS EXACT STRUCTURE ===' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'class_days' 
ORDER BY ordinal_position;

-- Also check if there's any existing data
SELECT '=== EXISTING CLASS_DAYS DATA ===' as info;
SELECT * FROM class_days LIMIT 3;

-- Check what tables might be related to academic years
SELECT '=== TABLES WITH ACADEMIC_YEAR_ID ===' as info;
SELECT table_name, column_name
FROM information_schema.columns 
WHERE column_name = 'academic_year_id'
ORDER BY table_name;
