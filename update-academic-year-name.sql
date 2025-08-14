-- Update Academic Year Name
-- This script changes the year name from "test" to "2025-2026 School Year"

-- ========================================
-- 1. CHECK CURRENT ACADEMIC YEAR
-- ========================================
SELECT '=== CURRENT ACADEMIC YEAR ===' as info;

SELECT 
    'Current Year Details:' as test,
    id,
    year_name,
    family_id,
    start_date,
    end_date,
    is_current
FROM academic_years
WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
ORDER BY start_date DESC;

-- ========================================
-- 2. UPDATE THE YEAR NAME
-- ========================================
SELECT '=== UPDATING YEAR NAME ===' as info;

-- Update the academic year name
UPDATE academic_years 
SET year_name = '2025-2026 School Year'
WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
AND year_name = 'test';

-- Verify the update
SELECT 
    'Year Name Updated:' as test,
    id,
    year_name,
    family_id,
    start_date,
    end_date,
    is_current
FROM academic_years
WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
ORDER BY start_date DESC;

-- ========================================
-- 3. NEXT STEPS
-- ========================================
SELECT '=== NEXT STEPS ===' as info;
SELECT '1. Academic year name has been updated to "2025-2026 School Year"' as step;
SELECT '2. Restart your app to see the change' as step;
SELECT '3. The Calendar View should now show "2025-2026 School Year" instead of "test"' as step;
