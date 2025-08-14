-- Fix Family Relationship Issue
-- This script ensures your user profile is connected to the family with demo data

-- ========================================
-- 1. CHECK CURRENT STATE
-- ========================================
SELECT '=== CURRENT STATE ===' as info;

-- Check what profiles exist
SELECT 
    'Profiles:' as test,
    id,
    email,
    family_id,
    created_at
FROM profiles
ORDER BY created_at DESC;

-- Check what families exist
SELECT 
    'Families:' as test,
    id,
    name,
    created_at
FROM family
ORDER BY created_at DESC;

-- ========================================
-- 2. FIX USER PROFILE FAMILY RELATIONSHIP
-- ========================================
SELECT '=== FIXING FAMILY RELATIONSHIP ===' as info;

-- Update your profile to use the family with demo data
-- Replace 'your-email@icloud.com' with your actual email
UPDATE profiles 
SET family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
WHERE email = 'katiebaumeister@icloud.com';

-- Verify the update
SELECT 
    'Profile Updated:' as test,
    id,
    email,
    family_id,
    created_at
FROM profiles
WHERE email = 'katiebaumeister@icloud.com';

-- ========================================
-- 3. VERIFY DATA ACCESS
-- ========================================
SELECT '=== VERIFYING DATA ACCESS ===' as info;

-- Check if you can now access the family data
SELECT 
    'Family Access:' as test,
    f.name as family_name,
    COUNT(c.id) as children_count,
    COUNT(ay.id) as academic_years_count,
    COUNT(st.id) as learning_tracks_count
FROM family f
LEFT JOIN children c ON f.id = c.family_id
LEFT JOIN academic_years ay ON f.id = ay.family_id
LEFT JOIN subject_track st ON f.id = st.family_id
WHERE f.id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
GROUP BY f.id, f.name;

-- Check academic years specifically
SELECT 
    'Academic Years:' as test,
    id,
    year_name,
    family_id,
    start_date,
    end_date
FROM academic_years
WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
ORDER BY start_date DESC;

-- Check learning tracks specifically
SELECT 
    'Learning Tracks:' as test,
    id,
    name,
    family_id,
    status
FROM subject_track
WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
ORDER BY name;

-- ========================================
-- 4. NEXT STEPS
-- ========================================
SELECT '=== NEXT STEPS ===' as info;
SELECT '1. Your profile should now be connected to the demo family' as step;
SELECT '2. Restart your app and check the Calendar View' as step;
SELECT '3. Click the "Debug Data" button to verify access' as step;
SELECT '4. You should now see calendar data, learning tracks, and schedule optimization' as step;
