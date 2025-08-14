-- Fix Permissions Only
-- This script fixes the 403 permission errors for holidays and activities

-- ========================================
-- 1. CHECK CURRENT PERMISSIONS
-- ========================================
SELECT '=== CURRENT PERMISSIONS ===' as info;

-- Check current RLS policies on holidays table
SELECT 
    'Holidays Policies:' as test,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'holidays';

-- Check current RLS policies on activities table
SELECT 
    'Activities Policies:' as test,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'activities';

-- ========================================
-- 2. FIX HOLIDAYS TABLE PERMISSIONS
-- ========================================
SELECT '=== FIXING HOLIDAYS PERMISSIONS ===' as info;

-- Drop any existing restrictive policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON holidays;
DROP POLICY IF EXISTS "Enable read access for all users" ON holidays;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON holidays;

-- Create new policy to allow authenticated users to read holidays for their family
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

-- Alternative: If the above doesn't work, create a simpler policy
-- CREATE POLICY "Enable read for family members" ON holidays
--     FOR SELECT
--     TO authenticated
--     USING (true);

-- ========================================
-- 3. FIX ACTIVITIES TABLE PERMISSIONS
-- ========================================
SELECT '=== FIXING ACTIVITIES PERMISSIONS ===' as info;

-- Drop any existing restrictive policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON activities;
DROP POLICY IF EXISTS "Enable read access for all users" ON activities;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON activities;

-- Create new policy to allow authenticated users to read activities for their family
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

-- Alternative: If the above doesn't work, create a simpler policy
-- CREATE POLICY "Enable read for family members" ON activities
--     FOR SELECT
--     TO authenticated
--     USING (true);

-- ========================================
-- 4. VERIFY PERMISSIONS FIXED
-- ========================================
SELECT '=== VERIFYING PERMISSIONS ===' as info;

-- Check new policies were created
SELECT 
    'New Policies Created:' as test,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename IN ('holidays', 'activities')
ORDER BY tablename, policyname;

-- ========================================
-- 5. TEST DATA ACCESS
-- ========================================
SELECT '=== TESTING DATA ACCESS ===' as info;

-- Test holidays access (this should work now)
SELECT 
    'Holidays Access Test:' as test,
    COUNT(*) as holidays_count
FROM holidays h
JOIN family_years fy ON h.family_year_id = fy.id
WHERE fy.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

-- Test activities access (this should work now)
SELECT 
    'Activities Access Test:' as test,
    COUNT(*) as activities_count
FROM activities a
JOIN children c ON a.child_id = c.id
WHERE c.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

-- ========================================
-- 6. NEXT STEPS
-- ========================================
SELECT '=== NEXT STEPS ===' as info;
SELECT '1. Permissions for holidays and activities have been fixed' as step;
SELECT '2. You should no longer see 403 permission errors' as step;
SELECT '3. Restart your app and check the Calendar View' as step;
SELECT '4. Holidays and activities should now be accessible' as step;
SELECT '5. Click "Debug Data" to verify all data loads without errors' as step;
