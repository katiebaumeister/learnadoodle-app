-- Debug App Data Access Issues
-- This script helps identify why the app isn't loading data

-- ========================================
-- 1. CHECK CURRENT USER PROFILE
-- ========================================
SELECT '=== CHECKING USER PROFILE ===' as info;

-- First, let's see what profiles exist
SELECT 
    'All Profiles:' as test,
    id,
    email,
    family_id,
    created_at
FROM profiles
ORDER BY created_at DESC
LIMIT 5;

-- ========================================
-- 2. CHECK FAMILY RELATIONSHIPS
-- ========================================
SELECT '=== CHECKING FAMILY RELATIONSHIPS ===' as info;

-- Check if the family exists
SELECT 
    'Family Check:' as test,
    id,
    name,
    created_at
FROM family
WHERE id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

-- Check all families
SELECT 
    'All Families:' as test,
    id,
    name,
    created_at
FROM family
ORDER BY created_at DESC;

-- ========================================
-- 3. CHECK ACADEMIC YEARS
-- ========================================
SELECT '=== CHECKING ACADEMIC YEARS ===' as info;

-- Check academic years for the specific family
SELECT 
    'Academic Years for Family:' as test,
    id,
    year_name,
    family_id,
    global_year_id,
    start_date,
    end_date
FROM academic_years
WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
ORDER BY start_date DESC;

-- Check all academic years
SELECT 
    'All Academic Years:' as test,
    id,
    year_name,
    family_id,
    global_year_id,
    start_date,
    end_date
FROM academic_years
ORDER BY created_at DESC
LIMIT 10;

-- ========================================
-- 4. CHECK FAMILY_YEARS TABLE
-- ========================================
SELECT '=== CHECKING FAMILY_YEARS ===' as info;

-- Check family_years for the specific family
SELECT 
    'Family Years for Family:' as test,
    id,
    family_id,
    global_year_id,
    created_at
FROM family_years
WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
ORDER BY created_at DESC;

-- Check all family_years
SELECT 
    'All Family Years:' as test,
    id,
    family_id,
    global_year_id,
    created_at
FROM family_years
ORDER BY created_at DESC
LIMIT 10;

-- ========================================
-- 5. CHECK SUBJECT TRACKS
-- ========================================
SELECT '=== CHECKING SUBJECT TRACKS ===' as info;

-- Check subject tracks for the specific family
SELECT 
    'Subject Tracks for Family:' as test,
    id,
    name,
    family_id,
    status,
    created_at
FROM subject_track
WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
ORDER BY name;

-- Check all subject tracks
SELECT 
    'All Subject Tracks:' as test,
    id,
    name,
    family_id,
    status,
    created_at
FROM subject_track
ORDER BY created_at DESC
LIMIT 10;

-- ========================================
-- 6. CHECK PERMISSIONS
-- ========================================
SELECT '=== CHECKING PERMISSIONS ===' as info;

-- Check if the current user can access these tables
SELECT 
    'Table Access Test:' as test,
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE tablename IN ('profiles', 'family', 'academic_years', 'family_years', 'subject_track', 'holidays', 'class_day_mappings')
ORDER BY tablename;

-- ========================================
-- 7. RECOMMENDATIONS
-- ========================================
SELECT '=== RECOMMENDATIONS ===' as info;
SELECT '1. Check if your user profile has the correct family_id' as step;
SELECT '2. Verify the family_id matches between profiles and family table' as step;
SELECT '3. Check if academic_years table has the correct family_id' as step;
SELECT '4. Verify RLS policies allow access to these tables' as step;
SELECT '5. Check if the data was loaded with the correct family_id' as step;
