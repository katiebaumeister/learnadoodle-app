-- Test App Data Access
-- This script verifies that your app can now see all the loaded data

-- ========================================
-- 1. TEST FAMILY AND CHILDREN ACCESS
-- ========================================
SELECT '=== TESTING FAMILY ACCESS ===' as info;

-- Check if family exists
SELECT 
    'Family Found:' as test,
    f.name as family_name,
    COUNT(c.id) as children_count
FROM family f
LEFT JOIN children c ON f.id = c.family_id
WHERE f.id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
GROUP BY f.id, f.name;

-- Check children profiles
SELECT 
    'Children Profiles:' as test,
    c.name,
    c.grade,
    c.age,
    c.learning_style
FROM children c
WHERE c.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
ORDER BY c.name;

-- ========================================
-- 2. TEST CALENDAR DATA ACCESS
-- ========================================
SELECT '=== TESTING CALENDAR ACCESS ===' as info;

-- Check academic years
SELECT 
    'Academic Years:' as test,
    ay.year_name,
    ay.start_date,
    ay.end_date,
    ay.is_current
FROM academic_years ay
WHERE ay.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
ORDER BY ay.start_date DESC;

-- Check class day mappings (calendar dates)
SELECT 
    'Calendar Dates:' as test,
    cdm.class_date,
    cdm.class_day_number,
    cdm.is_vacation
FROM class_day_mappings cdm
WHERE cdm.academic_year_id = '550e8400-e29b-41d4-a716-446655440004'
ORDER BY cdm.class_date
LIMIT 10;

-- Check holidays
SELECT 
    'Holidays:' as test,
    h.holiday_name,
    h.holiday_date,
    h.description
FROM holidays h
WHERE h.family_year_id = '550e8400-e29b-41d4-a716-446655440080'
ORDER BY h.holiday_date;

-- ========================================
-- 3. TEST LEARNING TRACKS ACCESS
-- ========================================
SELECT '=== TESTING LEARNING TRACKS ===' as info;

-- Check learning tracks
SELECT 
    'Learning Tracks:' as test,
    st.name,
    st.class_schedule,
    st.study_days,
    st.status
FROM subject_track st
WHERE st.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
ORDER BY st.name;

-- Check track details (first track)
SELECT 
    'Track Details (Max Math):' as test,
    st.name,
    st.initial_plan,
    st.roadmap,
    st.course_outline
FROM subject_track st
WHERE st.id = '550e8400-e29b-41d4-a716-446655440100';

-- ========================================
-- 4. TEST LESSONS ACCESS
-- ========================================
SELECT '=== TESTING LESSONS ===' as info;

-- Check lessons with tracks
SELECT 
    'Lessons with Tracks:' as test,
    l.content_summary,
    l.lesson_date,
    l.sequence_no,
    st.name as track_name
FROM lessons l
LEFT JOIN subject_track st ON l.subject_track_id = st.id
WHERE l.academic_year_id = '550e8400-e29b-41d4-a716-446655440004'
ORDER BY l.lesson_date, l.sequence_no;

-- ========================================
-- 5. TEST ATTENDANCE ACCESS
-- ========================================
SELECT '=== TESTING ATTENDANCE ===' as info;

-- Check attendance summary
SELECT 
    'Attendance Summary:' as test,
    c.name,
    COUNT(a.id) as total_days,
    COUNT(CASE WHEN a.attended THEN 1 END) as days_attended,
    ROUND(
        (COUNT(CASE WHEN a.attended THEN 1 END)::decimal / COUNT(a.id)::decimal) * 100, 1
    ) as attendance_percentage
FROM children c
LEFT JOIN attendance a ON c.id = a.child_id
WHERE c.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
GROUP BY c.id, c.name;

-- ========================================
-- 6. SUMMARY FOR APP INTEGRATION
-- ========================================
SELECT '=== APP INTEGRATION SUMMARY ===' as info;

SELECT 
    'Data Available:' as category,
    COUNT(DISTINCT f.id) as families,
    COUNT(DISTINCT c.id) as children,
    COUNT(DISTINCT ay.id) as academic_years,
    COUNT(DISTINCT cdm.id) as calendar_dates,
    COUNT(DISTINCT h.id) as holidays,
    COUNT(DISTINCT st.id) as learning_tracks,
    COUNT(DISTINCT l.id) as lessons,
    COUNT(DISTINCT a.id) as attendance_records
FROM family f
LEFT JOIN children c ON f.id = c.family_id
LEFT JOIN academic_years ay ON f.id = ay.family_id
LEFT JOIN class_day_mappings cdm ON ay.id = cdm.academic_year_id
LEFT JOIN family_years fy ON f.id = fy.family_id
LEFT JOIN holidays h ON fy.id = h.family_year_id
LEFT JOIN subject_track st ON f.id = st.family_id
LEFT JOIN lessons l ON ay.id = l.academic_year_id
LEFT JOIN attendance a ON c.id = a.child_id
WHERE f.id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

SELECT '=== NEXT STEPS ===' as info;
SELECT '1. Your app should now display calendar data' as step;
SELECT '2. Learning tracks should be visible below the calendar' as step;
SELECT '3. Schedule optimization stats should show at the bottom' as step;
SELECT '4. Check the console for data loading logs' as step;
