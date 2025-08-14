-- Debug and Fix Activities Table Permissions
-- This script will diagnose and fix the 403 permission errors

-- 1. First, let's check the current state
SELECT '=== CURRENT STATE ===' as info;

-- Check if activities table exists and has RLS enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'activities';

-- Check current RLS policies
SELECT 
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

-- 2. Check user authentication and family connection
SELECT '=== USER & FAMILY CONNECTION ===' as info;

-- Check if user is authenticated
SELECT 
  auth.uid() as current_user_id,
  auth.role() as current_role;

-- Check user's profile and family connection
SELECT 
  p.id as profile_id,
  p.family_id,
  f.name as family_name,
  p.created_at as profile_created
FROM profiles p
LEFT JOIN family f ON p.family_id = f.id
WHERE p.id = auth.uid();

-- 3. Check activities table structure and data
SELECT '=== ACTIVITIES TABLE INFO ===' as info;

-- Check table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'activities'
ORDER BY ordinal_position;

-- Check if there's any data
SELECT COUNT(*) as total_activities FROM activities;

-- Check family_id values in activities
SELECT 
  family_id,
  COUNT(*) as activity_count
FROM activities 
GROUP BY family_id;

-- 4. Fix the permissions step by step
SELECT '=== FIXING PERMISSIONS ===' as info;

-- Step 1: Ensure RLS is enabled
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop all existing policies
DROP POLICY IF EXISTS "Users can view their family's activities" ON activities;
DROP POLICY IF EXISTS "Users can insert their family's activities" ON activities;
DROP POLICY IF EXISTS "Users can update their family's activities" ON activities;
DROP POLICY IF EXISTS "Users can delete their family's activities" ON activities;

-- Step 3: Create a simple, working policy for SELECT
CREATE POLICY "Enable read access for authenticated users" ON activities
  FOR SELECT USING (auth.role() = 'authenticated');

-- Step 4: Create policy for INSERT
CREATE POLICY "Enable insert for authenticated users" ON activities
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Step 5: Create policy for UPDATE
CREATE POLICY "Enable update for authenticated users" ON activities
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Step 6: Create policy for DELETE
CREATE POLICY "Enable delete for authenticated users" ON activities
  FOR DELETE USING (auth.role() = 'authenticated');

-- 5. Test the permissions
SELECT '=== TESTING PERMISSIONS ===' as info;

-- Try to select from activities
SELECT 
  'SELECT test' as test_type,
  COUNT(*) as result_count
FROM activities;

-- 6. If the simple policy works, create the family-based policy
SELECT '=== CREATING FAMILY-BASED POLICIES ===' as info;

-- Drop the simple policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON activities;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON activities;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON activities;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON activities;

-- Create family-based policies with better error handling
CREATE POLICY "Users can view their family's activities" ON activities
  FOR SELECT USING (
    family_id IN (
      SELECT COALESCE(family_id, '00000000-0000-0000-0000-000000000000'::uuid) 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their family's activities" ON activities
  FOR INSERT WITH CHECK (
    family_id IN (
      SELECT COALESCE(family_id, '00000000-0000-0000-0000-000000000000'::uuid) 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update their family's activities" ON activities
  FOR UPDATE USING (
    family_id IN (
      SELECT COALESCE(family_id, '00000000-0000-0000-0000-000000000000'::uuid) 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their family's activities" ON activities
  FOR DELETE USING (
    family_id IN (
      SELECT COALESCE(family_id, '00000000-0000-0000-0000-000000000000'::uuid) 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

-- 7. Final verification
SELECT '=== FINAL VERIFICATION ===' as info;

-- Show final policies
SELECT 
  policyname,
  cmd,
  permissive
FROM pg_policies 
WHERE tablename = 'activities'
ORDER BY policyname;

-- Test final permissions
SELECT 
  'Final SELECT test' as test_type,
  COUNT(*) as result_count
FROM activities;
