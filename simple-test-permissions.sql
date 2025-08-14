-- Simple Test Permissions
-- This script tests if the permissions are working without column reference issues

-- ========================================
-- 1. TEST BASIC ACCESS
-- ========================================
SELECT '=== TESTING BASIC ACCESS ===' as info;

-- Test if we can access holidays table
SELECT 
    'Holidays Access:' as test,
    COUNT(*) as count
FROM holidays;

-- Test if we can access activities table
SELECT 
    'Activities Access:' as test,
    COUNT(*) as count
FROM activities;

-- Test if we can access subject_track table
SELECT 
    'Subject Tracks Access:' as test,
    COUNT(*) as count
FROM subject_track
WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

-- ========================================
-- 2. TEST FAMILY-SPECIFIC DATA
-- ========================================
SELECT '=== TESTING FAMILY DATA ===' as info;

-- Test holidays for your family
SELECT 
    'Family Holidays:' as test,
    COUNT(*) as count
FROM holidays h
JOIN family_years fy ON h.family_year_id = fy.id
WHERE fy.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

-- Test learning tracks for your family
SELECT 
    'Family Learning Tracks:' as test,
    name,
    status,
    CASE WHEN class_schedule IS NOT NULL THEN 'Has Schedule' ELSE 'No Schedule' END as schedule_status,
    CASE WHEN roadmap IS NOT NULL THEN 'Has Roadmap' ELSE 'No Roadmap' END as roadmap_status
FROM subject_track
WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
ORDER BY name;

-- ========================================
-- 3. SUMMARY
-- ========================================
SELECT '=== PERMISSIONS SUMMARY ===' as info;

SELECT 
    'Data Access Summary:' as test,
    (SELECT COUNT(*) FROM holidays) as total_holidays,
    (SELECT COUNT(*) FROM activities) as total_activities,
    (SELECT COUNT(*) FROM subject_track WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9') as family_learning_tracks,
    (SELECT COUNT(*) FROM class_day_mappings WHERE academic_year_id = 'd03ed429-a463-4764-8f1b-8ed381fb4383') as family_calendar_dates;

-- ========================================
-- 4. NEXT STEPS
-- ========================================
SELECT '=== NEXT STEPS ===' as info;
SELECT '1. If all counts show numbers (not errors), permissions are fixed' as step;
SELECT '2. If you see learning tracks with schedules and roadmaps, data is complete' as step;
SELECT '3. Restart your app and check the Calendar View' as step;
SELECT '4. You should now see all data without permission errors' as step;
