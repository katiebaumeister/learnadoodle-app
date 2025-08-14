-- Check app authentication context to understand why permissions are still failing
-- This will help diagnose the mismatch between SQL access and app access

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

-- 5. Check if the specific test family exists
SELECT 
  'Test Family Check' as info,
  f.id as family_id,
  f.name as family_name,
  COUNT(p.id) as member_count,
  CASE 
    WHEN f.id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9' THEN 'THIS IS YOUR TEST FAMILY'
    ELSE 'Other family'
  END as family_type
FROM family f
LEFT JOIN profiles p ON f.id = p.family_id
WHERE f.id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
GROUP BY f.id, f.name;

-- 6. Check if the current user is actually connected to the test family
SELECT 
  'User-Family Connection' as info,
  p.id as profile_id,
  p.email,
  p.family_id,
  f.name as family_name,
  CASE 
    WHEN p.family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9' THEN 'USER IS CONNECTED TO TEST FAMILY'
    WHEN p.family_id IS NULL THEN 'USER HAS NO FAMILY'
    ELSE 'USER IS CONNECTED TO DIFFERENT FAMILY: ' || f.name
  END as connection_status
FROM profiles p
LEFT JOIN family f ON p.family_id = f.id
WHERE p.id = auth.uid();

-- 7. Check if the app is using a different user context
SELECT 
  'App User Context Check' as info,
  'Current SQL User' as context,
  current_user as user_name,
  'SQL Editor' as source
UNION ALL
SELECT 
  'App User Context Check' as info,
  'App Auth User' as context,
  auth.uid()::text as user_name,
  'App Authentication' as source;

-- 8. Check if there are any RLS policies that might still be active
SELECT 
  'Remaining RLS Policies' as info,
  schemaname,
  tablename,
  policyname,
  cmd,
  permissive
FROM pg_policies 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename, policyname;

-- 9. Check if the tables actually exist and are accessible
SELECT 
  'Table Existence Check' as info,
  schemaname,
  tablename,
  tableowner,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename;

-- 10. Test direct table access without any joins
SELECT 
  'Direct Table Access Test' as info,
  'activities' as table_name,
  COUNT(*) as row_count
FROM activities
UNION ALL
SELECT 
  'Direct Table Access Test' as info,
  'class_days' as table_name,
  COUNT(*) as row_count
FROM class_days
UNION ALL
SELECT 
  'Direct Table Access Test' as info,
  'holidays' as table_name,
  COUNT(*) as row_count
FROM holidays;

-- 11. Check if there are any triggers or functions that might be blocking access
SELECT 
  'Triggers Check' as info,
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers 
WHERE event_object_table IN ('activities', 'class_days', 'holidays')
ORDER BY event_object_table, trigger_name;

-- 12. Final diagnosis
SELECT 
  'Diagnosis Summary' as info,
  CASE 
    WHEN auth.uid() IS NULL THEN 'NO AUTHENTICATED USER - This is the problem!'
    WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()) THEN 'USER NOT IN PROFILES - This is the problem!'
    WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND family_id IS NOT NULL) THEN 'USER HAS NO FAMILY_ID - This is the problem!'
    ELSE 'User authentication looks OK - Problem might be elsewhere'
  END as diagnosis,
  'Next: Check if app is using different credentials' as next_step;
