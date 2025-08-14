-- DEMO SHOWCASE QUERIES
-- This script demonstrates all the features you can now showcase with your loaded data

-- ========================================
-- 1. FAMILY OVERVIEW DASHBOARD
-- ========================================
SELECT '=== FAMILY OVERVIEW ===' as section;
SELECT 
    f.name as family_name,
    COUNT(c.id) as total_children,
    COUNT(DISTINCT ay.id) as academic_years,
    COUNT(DISTINCT st.id) as learning_tracks
FROM family f
LEFT JOIN children c ON f.id = c.family_id
LEFT JOIN academic_years ay ON f.id = ay.family_id
LEFT JOIN subject_track st ON f.id = st.family_id
WHERE f.id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
GROUP BY f.id, f.name;

-- ========================================
-- 2. CHILDREN PROFILES
-- ========================================
SELECT '=== CHILDREN PROFILES ===' as section;
SELECT 
    c.name,
    c.grade,
    c.age,
    c.learning_style,
    c.interests,
    c.standards,
    c.avatar
FROM children c
WHERE c.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
ORDER BY c.name;

-- ========================================
-- 3. CALENDAR SYSTEM DEMO
-- ========================================
SELECT '=== CALENDAR SYSTEM ===' as section;

-- Weekly Schedule Template
SELECT '--- Weekly Schedule Template ---' as subsection;
SELECT 
    cd.day_of_week,
    CASE cd.day_of_week 
        WHEN 1 THEN 'Monday'
        WHEN 2 THEN 'Tuesday' 
        WHEN 3 THEN 'Wednesday'
        WHEN 4 THEN 'Thursday'
        WHEN 5 THEN 'Friday'
    END as day_name,
    cd.hours_per_day,
    cd.notes
FROM class_days cd
WHERE cd.family_year_id = '550e8400-e29b-41d4-a716-446655440080'
ORDER BY cd.day_of_week;

-- Calendar Date Mappings (First 2 weeks)
SELECT '--- Calendar Date Mappings (First 2 Weeks) ---' as subsection;
SELECT 
    cdm.class_date,
    cdm.class_day_number,
    CASE cdm.class_date::text
        WHEN '2024-09-02' THEN 'Labor Day (Holiday)'
        ELSE 'School Day ' || cdm.class_day_number
    END as day_description,
    cdm.is_vacation
FROM class_day_mappings cdm
WHERE cdm.academic_year_id = '550e8400-e29b-41d4-a716-446655440004'
AND cdm.class_date BETWEEN '2024-08-26' AND '2024-09-06'
ORDER BY cdm.class_date;

-- ========================================
-- 4. HOLIDAY MANAGEMENT DEMO
-- ========================================
SELECT '=== HOLIDAY MANAGEMENT ===' as section;
SELECT 
    h.holiday_name,
    h.holiday_date,
    h.description,
    h.is_proposed,
    EXTRACT(month FROM h.holiday_date) as month
FROM holidays h
WHERE h.family_year_id = '550e8400-e29b-41d4-a716-446655440080'
ORDER BY h.holiday_date;

-- ========================================
-- 5. LEARNING TRACKS DEMO
-- ========================================
SELECT '=== LEARNING TRACKS ===' as section;

-- Track Overview
SELECT '--- Track Overview ---' as subsection;
SELECT 
    st.name,
    st.class_schedule,
    st.study_days,
    st.status,
    st.start_date,
    st.end_date
FROM subject_track st
WHERE st.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
ORDER BY st.name;

-- Detailed Track with Roadmap (Max's Math)
SELECT '--- Max Math Track Details ---' as subsection;
SELECT 
    st.name,
    st.initial_plan,
    st.roadmap,
    st.course_outline
FROM subject_track st
WHERE st.id = '550e8400-e29b-41d4-a716-446655440100';

-- ========================================
-- 6. LESSON PLANNING DEMO
-- ========================================
SELECT '=== LESSON PLANNING ===' as section;

-- Lessons by Track
SELECT '--- Lessons by Learning Track ---' as subsection;
SELECT 
    l.content_summary,
    l.lesson_date,
    l.sequence_no,
    st.name as track_name,
    c.name as student_name
FROM lessons l
LEFT JOIN subject_track st ON l.subject_track_id = st.id
LEFT JOIN children c ON (
    CASE 
        WHEN l.content_summary LIKE '%Fractions%' OR l.content_summary LIKE '%Math%' THEN c.name = 'Max'
        WHEN l.content_summary LIKE '%Addition%' OR l.content_summary LIKE '%Subtraction%' THEN c.name = 'Lilly'
        WHEN l.content_summary LIKE '%Science%' OR l.content_summary LIKE '%Earth%' THEN c.name = 'Max'
        WHEN l.content_summary LIKE '%Phonics%' OR l.content_summary LIKE '%Comprehension%' THEN c.name = 'Lilly'
        ELSE c.name = 'Unknown'
    END
)
WHERE l.academic_year_id = '550e8400-e29b-41d4-a716-446655440004'
ORDER BY l.lesson_date, l.sequence_no;

-- ========================================
-- 7. ATTENDANCE TRACKING DEMO
-- ========================================
SELECT '=== ATTENDANCE TRACKING ===' as section;

-- Attendance Summary
SELECT '--- Attendance Summary ---' as subsection;
SELECT 
    c.name,
    COUNT(a.id) as total_days,
    COUNT(CASE WHEN a.attended THEN 1 END) as days_attended,
    COUNT(CASE WHEN NOT a.attended THEN 1 END) as days_missed,
    ROUND(
        (COUNT(CASE WHEN a.attended THEN 1 END)::decimal / COUNT(a.id)::decimal) * 100, 1
    ) as attendance_percentage
FROM children c
LEFT JOIN attendance a ON c.id = a.child_id
WHERE c.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
GROUP BY c.id, c.name;

-- Recent Attendance
SELECT '--- Recent Attendance Details ---' as subsection;
SELECT 
    c.name,
    a.attendance_date,
    a.attended,
    a.notes
FROM attendance a
JOIN children c ON a.child_id = c.id
WHERE c.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
ORDER BY a.attendance_date DESC, c.name
LIMIT 10;

-- ========================================
-- 8. PROGRESS ANALYTICS DEMO
-- ========================================
SELECT '=== PROGRESS ANALYTICS ===' as section;

-- Learning Progress by Track
SELECT '--- Learning Progress by Track ---' as subsection;
SELECT 
    st.name as track_name,
    COUNT(l.id) as lessons_completed,
    MIN(l.lesson_date) as first_lesson,
    MAX(l.lesson_date) as last_lesson,
    COUNT(DISTINCT l.lesson_date) as active_days
FROM subject_track st
LEFT JOIN lessons l ON st.id = l.subject_track_id
WHERE st.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
GROUP BY st.id, st.name
ORDER BY st.name;

-- ========================================
-- 9. SCHEDULE OPTIMIZATION DEMO
-- ========================================
SELECT '=== SCHEDULE OPTIMIZATION ===' as section;

-- Daily Schedule Analysis
SELECT '--- Daily Schedule Analysis ---' as subsection;
SELECT 
    cd.day_of_week,
    CASE cd.day_of_week 
        WHEN 1 THEN 'Monday'
        WHEN 2 THEN 'Tuesday' 
        WHEN 3 THEN 'Wednesday'
        WHEN 4 THEN 'Thursday'
        WHEN 5 THEN 'Friday'
    END as day_name,
    cd.hours_per_day,
    COUNT(l.id) as lessons_scheduled,
    COUNT(DISTINCT st.id) as subjects_covered
FROM class_days cd
LEFT JOIN lessons l ON EXTRACT(dow FROM l.lesson_date) = cd.day_of_week
LEFT JOIN subject_track st ON l.subject_track_id = st.id
WHERE cd.family_year_id = '550e8400-e29b-41d4-a716-446655440080'
GROUP BY cd.day_of_week, cd.hours_per_day
ORDER BY cd.day_of_week;

-- ========================================
-- 10. DEMO SCENARIOS
-- ========================================
SELECT '=== DEMO SCENARIOS ===' as section;
SELECT '1. Show family dashboard with overview' as demo_scenario;
SELECT '2. Demonstrate calendar updates and holiday management' as demo_scenario;
SELECT '3. Show learning track progression and roadmaps' as demo_scenario;
SELECT '4. Display lesson planning and scheduling' as demo_scenario;
SELECT '5. Show attendance tracking and analytics' as demo_scenario;
SELECT '6. Demonstrate progress tracking through milestones' as demo_scenario;
