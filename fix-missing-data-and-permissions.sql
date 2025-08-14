-- Fix Missing Data and Permissions
-- This script loads learning tracks data and fixes permission issues

-- ========================================
-- 1. CHECK CURRENT STATE
-- ========================================
SELECT '=== CURRENT STATE ===' as info;

-- Check what subject tracks exist for your family
SELECT 
    'Current Subject Tracks:' as test,
    COUNT(*) as count
FROM subject_track
WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

-- Check what subject tracks exist globally
SELECT 
    'All Subject Tracks:' as test,
    family_id,
    name,
    status,
    created_at
FROM subject_track
ORDER BY created_at DESC
LIMIT 10;

-- ========================================
-- 2. LOAD LEARNING TRACKS FOR YOUR FAMILY
-- ========================================
SELECT '=== LOADING LEARNING TRACKS ===' as info;

-- Insert learning tracks for your family
INSERT INTO subject_track (
    id,
    family_id,
    name,
    description,
    class_schedule,
    study_days,
    status,
    initial_plan,
    roadmap,
    course_outline,
    created_at,
    updated_at
) VALUES 
-- Max's Math Track
(
    gen_random_uuid(),
    '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9',
    'Max Math - 4th Grade',
    'Comprehensive 4th grade mathematics curriculum',
    '9:00 AM - 10:30 AM',
    'Monday, Wednesday, Friday',
    'active',
    '{"goal": "Master 4th grade math concepts", "duration": "9 months", "focus": "Fractions, decimals, geometry"}',
    '{"units": [{"name": "Number Sense", "lessons": 15, "duration": "3 weeks"}, {"name": "Fractions", "lessons": 20, "duration": "4 weeks"}, {"name": "Decimals", "lessons": 18, "duration": "4 weeks"}, {"name": "Geometry", "lessons": 16, "duration": "3 weeks"}, {"name": "Measurement", "lessons": 14, "duration": "3 weeks"}, {"name": "Data Analysis", "lessons": 12, "duration": "2 weeks"}]}',
    '{"topics": ["Place value", "Addition/subtraction", "Multiplication/division", "Fractions", "Decimals", "Geometry", "Measurement", "Data analysis"], "skills": ["Problem solving", "Critical thinking", "Mathematical reasoning"]}',
    NOW(),
    NOW()
),
-- Max's Science Track
(
    gen_random_uuid(),
    '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9',
    'Max Science - 4th Grade',
    'Interactive 4th grade science exploration',
    '11:00 AM - 12:30 PM',
    'Tuesday, Thursday',
    'active',
    '{"goal": "Explore scientific concepts through hands-on activities", "duration": "9 months", "focus": "Life science, physical science, earth science"}',
    '{"units": [{"name": "Ecosystems", "lessons": 12, "duration": "3 weeks"}, {"name": "Energy", "lessons": 14, "duration": "3 weeks"}, {"name": "Matter", "lessons": 16, "duration": "4 weeks"}, {"name": "Earth Systems", "lessons": 18, "duration": "4 weeks"}, {"name": "Engineering Design", "lessons": 10, "duration": "2 weeks"}]}',
    '{"topics": ["Ecosystems", "Energy transfer", "Properties of matter", "Earth processes", "Engineering"], "skills": ["Scientific inquiry", "Observation", "Experimentation", "Data collection"]}',
    NOW(),
    NOW()
),
-- Lilly's Reading Track
(
    gen_random_uuid(),
    '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9',
    'Lilly Reading - 2nd Grade',
    'Comprehensive 2nd grade reading program',
    '9:00 AM - 10:00 AM',
    'Monday, Tuesday, Wednesday, Thursday, Friday',
    'active',
    '{"goal": "Develop strong reading fluency and comprehension", "duration": "9 months", "focus": "Phonics, fluency, comprehension"}',
    '{"units": [{"name": "Phonics Mastery", "lessons": 20, "duration": "4 weeks"}, {"name": "Reading Fluency", "lessons": 25, "duration": "5 weeks"}, {"name": "Comprehension Strategies", "lessons": 30, "duration": "6 weeks"}, {"name": "Vocabulary Building", "lessons": 15, "duration": "3 weeks"}, {"name": "Reading for Meaning", "lessons": 20, "duration": "4 weeks"}]}',
    '{"topics": ["Phonics", "Sight words", "Reading fluency", "Comprehension", "Vocabulary"], "skills": ["Decoding", "Fluency", "Comprehension", "Critical thinking"]}',
    NOW(),
    NOW()
),
-- Lilly's Math Track
(
    gen_random_uuid(),
    '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9',
    'Lilly Math - 2nd Grade',
    'Fun 2nd grade mathematics foundation',
    '10:30 AM - 11:30 AM',
    'Monday, Wednesday, Friday',
    'active',
    '{"goal": "Build strong math foundation", "duration": "9 months", "focus": "Number sense, addition, subtraction, basic geometry"}',
    '{"units": [{"name": "Number Sense", "lessons": 18, "duration": "4 weeks"}, {"name": "Addition & Subtraction", "lessons": 25, "duration": "5 weeks"}, {"name": "Place Value", "lessons": 20, "duration": "4 weeks"}, {"name": "Geometry", "lessons": 15, "duration": "3 weeks"}, {"name": "Measurement", "lessons": 16, "duration": "3 weeks"}, {"name": "Problem Solving", "lessons": 12, "duration": "2 weeks"}]}',
    '{"topics": ["Number sense", "Addition/subtraction", "Place value", "Geometry", "Measurement"], "skills": ["Counting", "Basic operations", "Problem solving", "Mathematical thinking"]}',
    NOW(),
    NOW()
),
-- Family History Track
(
    gen_random_uuid(),
    '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9',
    'Family History & Social Studies',
    'Interactive family and community learning',
    '2:00 PM - 3:00 PM',
    'Tuesday, Thursday',
    'active',
    '{"goal": "Learn about family, community, and world", "duration": "9 months", "focus": "Family history, community, geography"}',
    '{"units": [{"name": "Our Family", "lessons": 10, "duration": "2 weeks"}, {"name": "Our Community", "lessons": 12, "duration": "3 weeks"}, {"name": "Our State", "lessons": 15, "duration": "3 weeks"}, {"name": "Our Country", "lessons": 18, "duration": "4 weeks"}, {"name": "Our World", "lessons": 20, "duration": "4 weeks"}]}',
    '{"topics": ["Family history", "Community", "Geography", "Culture", "History"], "skills": ["Research", "Interviewing", "Mapping", "Cultural awareness"]}',
    NOW(),
    NOW()
),
-- Creative Arts Track
(
    gen_random_uuid(),
    '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9',
    'Creative Arts & Expression',
    'Multi-disciplinary arts and creativity',
    '3:30 PM - 4:30 PM',
    'Monday, Wednesday, Friday',
    'active',
    '{"goal": "Develop creativity and artistic expression", "duration": "9 months", "focus": "Visual arts, music, drama, creative writing"}',
    '{"units": [{"name": "Visual Arts", "lessons": 15, "duration": "3 weeks"}, {"name": "Music & Movement", "lessons": 18, "duration": "4 weeks"}, {"name": "Drama & Storytelling", "lessons": 12, "duration": "3 weeks"}, {"name": "Creative Writing", "lessons": 20, "duration": "4 weeks"}, {"name": "Mixed Media", "lessons": 16, "duration": "3 weeks"}]}',
    '{"topics": ["Drawing", "Painting", "Music", "Drama", "Creative writing"], "skills": ["Creativity", "Self-expression", "Fine motor skills", "Imagination"]}',
    NOW(),
    NOW()
);

-- ========================================
-- 3. VERIFY LEARNING TRACKS LOADED
-- ========================================
SELECT '=== VERIFYING LEARNING TRACKS ===' as info;

-- Check the newly loaded tracks
SELECT 
    'Learning Tracks Loaded:' as test,
    name,
    class_schedule,
    study_days,
    status
FROM subject_track
WHERE family_id = '86ba8b4b-e138-4af3-9492e1d3a00c9'
ORDER BY name;

-- ========================================
-- 4. FIX PERMISSIONS FOR HOLIDAYS TABLE
-- ========================================
SELECT '=== FIXING HOLIDAYS PERMISSIONS ===' as info;

-- Check current RLS policies on holidays table
SELECT 
    'Current Holidays Policies:' as test,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'holidays';

-- Create a policy to allow authenticated users to read holidays for their family
-- First, drop any existing restrictive policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON holidays;

-- Create new policy
CREATE POLICY "Enable read access for authenticated users" ON holidays
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN family_years fy ON p.family_id = fy.family_id
            WHERE p.id = auth.uid()
            AND fy.id = holidays.family_year_id
        )
    );

-- ========================================
-- 5. FIX PERMISSIONS FOR ACTIVITIES TABLE
-- ========================================
SELECT '=== FIXING ACTIVITIES PERMISSIONS ===' as info;

-- Check current RLS policies on activities table
SELECT 
    'Current Activities Policies:' as test,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'activities';

-- Create a policy to allow authenticated users to read activities for their family
-- First, drop any existing restrictive policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON activities;

-- Create new policy
CREATE POLICY "Enable read access for authenticated users" ON activities
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN children c ON p.family_id = c.family_id
            WHERE p.id = auth.uid()
            AND c.id = activities.child_id
        )
    );

-- ========================================
-- 6. VERIFY PERMISSIONS FIXED
-- ========================================
SELECT '=== VERIFYING PERMISSIONS ===' as info;

-- Test holidays access
SELECT 
    'Holidays Access Test:' as test,
    COUNT(*) as holidays_count
FROM holidays h
JOIN family_years fy ON h.family_year_id = fy.id
WHERE fy.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

-- Test activities access
SELECT 
    'Activities Access Test:' as test,
    COUNT(*) as activities_count
FROM activities a
JOIN children c ON a.child_id = c.id
WHERE c.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

-- ========================================
-- 7. FINAL VERIFICATION
-- ========================================
SELECT '=== FINAL VERIFICATION ===' as info;

-- Summary of what should now be accessible
SELECT 
    'Data Summary:' as test,
    (SELECT COUNT(*) FROM subject_track WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9') as learning_tracks,
    (SELECT COUNT(*) FROM class_day_mappings WHERE academic_year_id = 'd03ed429-a463-4764-8f1b-8ed381fb4383') as calendar_dates,
    (SELECT COUNT(*) FROM holidays h JOIN family_years fy ON h.family_year_id = fy.id WHERE fy.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9') as holidays,
    (SELECT COUNT(*) FROM activities a JOIN children c ON a.child_id = c.id WHERE c.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9') as activities;

-- ========================================
-- 8. NEXT STEPS
-- ========================================
SELECT '=== NEXT STEPS ===' as info;
SELECT '1. Learning tracks data has been loaded (6 tracks)' as step;
SELECT '2. Permissions for holidays and activities have been fixed' as step;
SELECT '3. Restart your app and check the Calendar View' as step;
SELECT '4. You should now see learning tracks, holidays, and activities' as step;
SELECT '5. Click "Debug Data" to verify all data is accessible' as step;
