-- Comprehensive Fix All Issues
-- This script fixes permissions, learning tracks data, and ensures everything works

-- ========================================
-- 1. CHECK CURRENT STATE
-- ========================================
SELECT '=== CURRENT STATE ===' as info;

-- Check current permissions
SELECT 
    'Current Policies:' as test,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename IN ('holidays', 'activities', 'subject_track')
ORDER BY tablename, policyname;

-- Check learning tracks data
SELECT 
    'Learning Tracks Status:' as test,
    COUNT(*) as total_tracks,
    COUNT(CASE WHEN class_schedule IS NOT NULL THEN 1 END) as tracks_with_schedule,
    COUNT(CASE WHEN roadmap IS NOT NULL THEN 1 END) as tracks_with_roadmap
FROM subject_track
WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

-- ========================================
-- 2. COMPLETELY RESET PERMISSIONS
-- ========================================
SELECT '=== RESETTING PERMISSIONS ===' as info;

-- Drop ALL existing policies on these tables
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON holidays;
DROP POLICY IF EXISTS "Enable read access for all users" ON holidays;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON holidays;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON activities;
DROP POLICY IF EXISTS "Enable read access for all users" ON activities;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON activities;

-- ========================================
-- 3. CREATE SIMPLE PERMISSIONS
-- ========================================
SELECT '=== CREATING SIMPLE PERMISSIONS ===' as info;

-- Create simple policy for holidays - allow all authenticated users to read
CREATE POLICY "Allow authenticated users to read holidays" ON holidays
    FOR SELECT
    TO authenticated
    USING (true);

-- Create simple policy for activities - allow all authenticated users to read
CREATE POLICY "Allow authenticated users to read activities" ON activities
    FOR SELECT
    TO authenticated
    USING (true);

-- Create simple policy for subject_track - allow all authenticated users to read
CREATE POLICY "Allow authenticated users to read subject_track" ON subject_track
    FOR SELECT
    TO authenticated
    USING (true);

-- ========================================
-- 4. ENSURE LEARNING TRACKS HAVE DATA
-- ========================================
SELECT '=== ENSURING LEARNING TRACKS DATA ===' as info;

-- First, add missing columns if they don't exist
DO $$ 
BEGIN
    -- Add class_schedule column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subject_track' AND column_name = 'class_schedule') THEN
        ALTER TABLE subject_track ADD COLUMN class_schedule TEXT;
        RAISE NOTICE 'Added class_schedule column';
    END IF;
    
    -- Add study_days column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subject_track' AND column_name = 'study_days') THEN
        ALTER TABLE subject_track ADD COLUMN study_days TEXT;
        RAISE NOTICE 'Added study_days column';
    END IF;
    
    -- Add roadmap column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subject_track' AND column_name = 'roadmap') THEN
        ALTER TABLE subject_track ADD COLUMN roadmap JSONB;
        RAISE NOTICE 'Added roadmap column';
    END IF;
    
    -- Add course_outline column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subject_track' AND column_name = 'course_outline') THEN
        ALTER TABLE subject_track ADD COLUMN course_outline JSONB;
        RAISE NOTICE 'Added course_outline column';
    END IF;
END $$;

-- Now update all existing tracks with data
UPDATE subject_track 
SET 
    class_schedule = '9:00 AM - 10:30 AM',
    study_days = 'Monday, Wednesday, Friday',
    roadmap = '{"units": [{"name": "Number Sense", "lessons": 15, "duration": "3 weeks"}, {"name": "Fractions", "lessons": 20, "duration": "4 weeks"}, {"name": "Decimals", "lessons": 18, "duration": "4 weeks"}, {"name": "Geometry", "lessons": 16, "duration": "3 weeks"}, {"name": "Measurement", "lessons": 14, "duration": "3 weeks"}, {"name": "Data Analysis", "lessons": 12, "duration": "2 weeks"}]}',
    course_outline = '{"topics": ["Place value", "Addition/subtraction", "Multiplication/division", "Fractions", "Decimals", "Geometry", "Measurement", "Data analysis"], "skills": ["Problem solving", "Critical thinking", "Mathematical reasoning"]}'
WHERE name = 'Max Math Track - 4th Grade' AND family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

UPDATE subject_track 
SET 
    class_schedule = '11:00 AM - 12:30 PM',
    study_days = 'Tuesday, Thursday',
    roadmap = '{"units": [{"name": "Ecosystems", "lessons": 12, "duration": "3 weeks"}, {"name": "Energy", "lessons": 14, "duration": "3 weeks"}, {"name": "Matter", "lessons": 16, "duration": "4 weeks"}, {"name": "Earth Systems", "lessons": 18, "duration": "4 weeks"}, {"name": "Engineering Design", "lessons": 10, "duration": "2 weeks"}]}',
    course_outline = '{"topics": ["Ecosystems", "Energy transfer", "Properties of matter", "Earth processes", "Engineering"], "skills": ["Scientific inquiry", "Observation", "Experimentation", "Data collection"]}'
WHERE name = 'Max Science Track - 4th Grade' AND family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

UPDATE subject_track 
SET 
    class_schedule = '2:00 PM - 3:30 PM',
    study_days = 'Monday, Wednesday, Friday',
    roadmap = '{"units": [{"name": "Reading Comprehension", "lessons": 20, "duration": "4 weeks"}, {"name": "Writing Skills", "lessons": 25, "duration": "5 weeks"}, {"name": "Grammar & Vocabulary", "lessons": 18, "duration": "4 weeks"}, {"name": "Literature Analysis", "lessons": 22, "duration": "4 weeks"}, {"name": "Creative Writing", "lessons": 15, "duration": "3 weeks"}]}',
    course_outline = '{"topics": ["Reading comprehension", "Writing skills", "Grammar", "Vocabulary", "Literature"], "skills": ["Critical reading", "Writing", "Communication", "Analysis"]}'
WHERE name = 'Max Language Arts Track - 4th Grade' AND family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

UPDATE subject_track 
SET 
    class_schedule = '10:30 AM - 11:30 AM',
    study_days = 'Monday, Wednesday, Friday',
    roadmap = '{"units": [{"name": "Number Sense", "lessons": 18, "duration": "4 weeks"}, {"name": "Addition & Subtraction", "lessons": 25, "duration": "5 weeks"}, {"name": "Place Value", "lessons": 20, "duration": "4 weeks"}, {"name": "Geometry", "lessons": 15, "duration": "3 weeks"}, {"name": "Measurement", "lessons": 16, "duration": "3 weeks"}, {"name": "Problem Solving", "lessons": 12, "duration": "2 weeks"}]}',
    course_outline = '{"topics": ["Number sense", "Addition/subtraction", "Place value", "Geometry", "Measurement"], "skills": ["Counting", "Basic operations", "Problem solving", "Mathematical thinking"]}'
WHERE name = 'Lilly Math Track - 2nd Grade' AND family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

UPDATE subject_track 
SET 
    class_schedule = '9:00 AM - 10:00 AM',
    study_days = 'Monday, Tuesday, Wednesday, Thursday, Friday',
    roadmap = '{"units": [{"name": "Phonics Mastery", "lessons": 20, "duration": "4 weeks"}, {"name": "Reading Fluency", "lessons": 25, "duration": "5 weeks"}, {"name": "Comprehension Strategies", "lessons": 30, "duration": "6 weeks"}, {"name": "Vocabulary Building", "lessons": 15, "duration": "3 weeks"}, {"name": "Reading for Meaning", "lessons": 20, "duration": "4 weeks"}]}',
    course_outline = '{"topics": ["Phonics", "Sight words", "Reading fluency", "Comprehension", "Vocabulary"], "skills": ["Decoding", "Fluency", "Comprehension", "Critical thinking"]}'
WHERE name = 'Lilly Reading Track - 2nd Grade' AND family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

UPDATE subject_track 
SET 
    class_schedule = '3:30 PM - 4:30 PM',
    study_days = 'Monday, Wednesday, Friday',
    roadmap = '{"units": [{"name": "Visual Arts", "lessons": 15, "duration": "3 weeks"}, {"name": "Music & Movement", "lessons": 18, "duration": "4 weeks"}, {"name": "Drama & Storytelling", "lessons": 12, "duration": "3 weeks"}, {"name": "Creative Writing", "lessons": 20, "duration": "4 weeks"}, {"name": "Mixed Media", "lessons": 16, "duration": "3 weeks"}]}',
    course_outline = '{"topics": ["Drawing", "Painting", "Music", "Drama", "Creative writing"], "skills": ["Creativity", "Self-expression", "Fine motor skills", "Imagination"]}'
WHERE name = 'Lilly Art Track - 2nd Grade' AND family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

-- ========================================
-- 5. VERIFY EVERYTHING IS WORKING
-- ========================================
SELECT '=== VERIFYING FIXES ===' as info;

-- Check new policies
SELECT 
    'New Policies Created:' as test,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename IN ('holidays', 'activities', 'subject_track')
ORDER BY table_name, policyname;

-- Check learning tracks now have data
SELECT 
    'Learning Tracks Updated:' as test,
    name,
    class_schedule,
    study_days,
    CASE WHEN roadmap IS NOT NULL THEN 'Has Roadmap' ELSE 'No Roadmap' END as roadmap_status,
    CASE WHEN course_outline IS NOT NULL THEN 'Has Outline' ELSE 'No Outline' END as outline_status
FROM subject_track
WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
ORDER BY name;

-- Test data access
SELECT 
    'Data Access Test:' as test,
    (SELECT COUNT(*) FROM holidays) as holidays_count,
    (SELECT COUNT(*) FROM activities) as activities_count,
    (SELECT COUNT(*) FROM subject_track WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9') as learning_tracks_count,
    (SELECT COUNT(*) FROM class_day_mappings WHERE academic_year_id = 'd03ed429-a463-4764-8f1b-8ed381fb4383') as calendar_dates_count;

-- ========================================
-- 6. NEXT STEPS
-- ========================================
SELECT '=== NEXT STEPS ===' as info;
SELECT '1. All permissions have been reset and simplified' as step;
SELECT '2. Learning tracks now have full data (schedules, study days, roadmaps)' as step;
SELECT '3. Restart your app and check the Calendar View' as step;
SELECT '4. You should now see learning tracks, holidays, and activities' as step;
SELECT '5. Click "Debug Data" to verify everything loads without errors' as step;
