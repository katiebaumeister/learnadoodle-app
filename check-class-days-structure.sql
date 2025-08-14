-- Check the exact structure of class_days table
-- This will show us what columns actually exist

SELECT '=== CLASS_DAYS TABLE STRUCTURE ===' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'class_days' 
ORDER BY ordinal_position;

-- Check if there's any existing data
SELECT '=== EXISTING CLASS_DAYS DATA ===' as info;
SELECT * FROM class_days LIMIT 3;
