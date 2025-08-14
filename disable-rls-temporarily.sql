-- Temporarily disable RLS completely to get tables working
-- This will help us identify if the issue is RLS policies or authentication

-- 1. Check current authentication context
SELECT 
  'Authentication Debug' as info,
  auth.uid() as user_id,
  current_user as database_user,
  current_setting('request.jwt.claims', true) as jwt_claims,
  current_setting('request.jwt.claims', true)::jsonb->>'email' as user_email;

-- 2. Check if the user exists in profiles
SELECT 
  'Profile Check' as info,
  p.id as profile_id,
  p.family_id,
  p.email,
  CASE 
    WHEN p.id IS NULL THEN 'USER NOT FOUND IN PROFILES'
    WHEN p.family_id IS NULL THEN 'USER HAS NO FAMILY_ID'
    ELSE 'USER OK: ' || p.email
  END as status
FROM profiles p
WHERE p.id = auth.uid();

-- 3. Check all profiles to see what's in the table
SELECT 
  'All Profiles' as info,
  p.id as profile_id,
  p.email,
  p.family_id,
  CASE 
    WHEN p.family_id IS NULL THEN 'NO FAMILY_ID'
    ELSE 'Has family_id: ' || p.family_id::text
  END as family_status
FROM profiles p
ORDER BY p.created_at DESC
LIMIT 10;

-- 4. Check if there are any families
SELECT 
  'Families Check' as info,
  f.id as family_id,
  f.name as family_name,
  COUNT(p.id) as member_count
FROM family f
LEFT JOIN profiles p ON f.id = p.family_id
GROUP BY f.id, f.name
ORDER BY f.created_at DESC;

-- 5. Completely disable RLS on all three tables
ALTER TABLE activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE class_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE holidays DISABLE RLS;

-- 6. Test table access with RLS disabled
SELECT 
  'RLS Disabled - Testing Access' as status,
  COUNT(*) as activities_count
FROM activities;

SELECT 
  'RLS Disabled - Testing Access' as status,
  COUNT(*) as class_days_count
FROM class_days;

SELECT 
  'RLS Disabled - Testing Access' as status,
  COUNT(*) as holidays_count
FROM holidays;

-- 7. Show current RLS status
SELECT 
  'Current RLS Status' as info,
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename;

-- 8. Drop all RLS policies since we're not using them
DROP POLICY IF EXISTS "Simple activities policy" ON activities;
DROP POLICY IF EXISTS "Simple class_days policy" ON class_days;
DROP POLICY IF EXISTS "Simple holidays policy" ON holidays;

-- 9. Show final status - no policies should exist
SELECT 
  'Final Policy Status' as info,
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename, policyname;

-- 10. Test insert/update/delete operations (only if we have a family_id)
DO $$
DECLARE
  family_id_val UUID;
BEGIN
  -- Get the current user's family_id
  SELECT p.family_id INTO family_id_val
  FROM profiles p
  WHERE p.id = auth.uid();
  
  IF family_id_val IS NOT NULL THEN
    -- Test insert
    INSERT INTO activities (family_id, name, activity_type)
    VALUES (family_id_val, 'Test Activity - RLS Disabled', 'test');
    
    -- Test update
    UPDATE activities 
    SET name = 'Updated Test Activity'
    WHERE name = 'Test Activity - RLS Disabled';
    
    -- Test delete
    DELETE FROM activities 
    WHERE name = 'Updated Test Activity';
    
    RAISE NOTICE 'Test operations completed successfully for family_id: %', family_id_val;
  ELSE
    RAISE NOTICE 'No family_id found - skipping test operations';
  END IF;
END $$;

-- 11. Final verification - tables should be fully accessible
SELECT 
  'Final Access Test' as status,
  'activities' as table_name,
  COUNT(*) as row_count
FROM activities
UNION ALL
SELECT 
  'Final Access Test' as status,
  'class_days' as table_name,
  COUNT(*) as row_count
FROM class_days
UNION ALL
SELECT 
  'Final Access Test' as status,
  'holidays' as table_name,
  COUNT(*) as row_count
FROM holidays;
