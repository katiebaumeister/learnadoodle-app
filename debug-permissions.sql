-- Debug permissions and RLS policies
-- This will help us understand why the permissions are still being denied

-- 1. Check current user context
SELECT 
  'Current User Context' as info,
  auth.uid() as user_id,
  current_user as database_user,
  current_setting('request.jwt.claims', true) as jwt_claims;

-- 2. Check if user has a profile
SELECT 
  'User Profile Check' as info,
  p.id as profile_id,
  p.family_id,
  f.name as family_name
FROM profiles p
LEFT JOIN family f ON p.family_id = f.id
WHERE p.id = auth.uid();

-- 3. Check if family_years exist
SELECT 
  'Family Years Check' as info,
  fy.id as family_year_id,
  fy.family_id,
  fy.start_date,
  fy.end_date
FROM family_years fy
JOIN family f ON fy.family_id = f.id
JOIN profiles p ON f.id = p.family_id
WHERE p.id = auth.uid();

-- 4. Check table existence and RLS status
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  hasindexes,
  hasrules,
  hastriggers
FROM pg_tables 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename;

-- 5. Check RLS policies
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
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename, policyname;

-- 6. Test direct table access (this should fail with RLS)
SELECT 
  'Direct Table Access Test' as info,
  COUNT(*) as activities_count
FROM activities;

-- 7. Check if tables have any data
SELECT 
  'Table Data Check' as info,
  'activities' as table_name,
  COUNT(*) as row_count
FROM activities
UNION ALL
SELECT 
  'Table Data Check' as info,
  'class_days' as table_name,
  COUNT(*) as row_count
FROM class_days
UNION ALL
SELECT 
  'Table Data Check' as info,
  'holidays' as table_name,
  COUNT(*) as row_count
FROM holidays;

-- 8. Check column structure for calendar tables
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name IN ('activities', 'class_days', 'holidays')
ORDER BY table_name, ordinal_position;

-- 9. Check family_years table structure
SELECT 
  'Family Years Table Structure' as info,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'family_years'
ORDER BY ordinal_position;
