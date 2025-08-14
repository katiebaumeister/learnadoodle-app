-- EMERGENCY FIX: Temporarily disable RLS on activities table
-- This will get your app working immediately, but is NOT recommended for production
-- Run this if you need to get the app working right now

-- 1. Disable RLS temporarily
ALTER TABLE activities DISABLE ROW LEVEL SECURITY;

-- 2. Verify RLS is disabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'activities';

-- 3. Test access
SELECT 
  'Emergency fix test' as status,
  COUNT(*) as activities_count
FROM activities;

-- IMPORTANT: After your app is working, you should re-enable RLS with proper policies
-- To re-enable later, run:
-- ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
-- Then run the debug-activities-permissions.sql script to set up proper policies
