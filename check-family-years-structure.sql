-- Check the exact structure of family_years table
-- This will show us what columns are required

SELECT '=== FAMILY_YEARS STRUCTURE ===' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'family_years' 
ORDER BY ordinal_position;

-- Also check if there's any existing data
SELECT '=== EXISTING FAMILY_YEARS DATA ===' as info;
SELECT * FROM family_years LIMIT 3;
