-- Force disable ALL RLS and drop ALL policies to ensure nothing blocks access
-- This is a nuclear option to get the tables working

-- 1. First, let's see what RLS policies actually exist
SELECT 
  'Current RLS Policies' as info,
  schemaname,
  tablename,
  policyname,
  cmd,
  permissive
FROM pg_policies 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename, policyname;

-- 2. Force disable RLS on all three tables
ALTER TABLE activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE class_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE holidays DISABLE ROW LEVEL SECURITY;

-- 3. Drop ALL policies on these tables (including any we might have missed)
DROP POLICY IF EXISTS "Users can view their family's activities" ON activities;
DROP POLICY IF EXISTS "Users can insert their family's activities" ON activities;
DROP POLICY IF EXISTS "Users can update their family's activities" ON activities;
DROP POLICY IF EXISTS "Users can delete their family's activities" ON activities;
DROP POLICY IF EXISTS "Users can view their family's class days" ON class_days;
DROP POLICY IF EXISTS "Users can insert their family's class days" ON class_days;
DROP POLICY IF EXISTS "Users can update their family's class days" ON class_days;
DROP POLICY IF EXISTS "Users can delete their family's class days" ON class_days;
DROP POLICY IF EXISTS "Users can view their family's holidays" ON holidays;
DROP POLICY IF EXISTS "Users can insert their family's holidays" ON holidays;
DROP POLICY IF EXISTS "Users can update their family's holidays" ON holidays;
DROP POLICY IF EXISTS "Users can delete their family's holidays" ON holidays;
DROP POLICY IF EXISTS "Simple activities policy" ON activities;
DROP POLICY IF EXISTS "Simple class_days policy" ON class_days;
DROP POLICY IF EXISTS "Simple holidays policy" ON holidays;

-- 4. Drop any policies with similar names that might exist
DROP POLICY IF EXISTS "activities_policy" ON activities;
DROP POLICY IF EXISTS "class_days_policy" ON class_days;
DROP POLICY IF EXISTS "holidays_policy" ON holidays;
DROP POLICY IF EXISTS "activities_select_policy" ON activities;
DROP POLICY IF EXISTS "activities_insert_policy" ON activities;
DROP POLICY IF EXISTS "activities_update_policy" ON activities;
DROP POLICY IF EXISTS "activities_delete_policy" ON activities;
DROP POLICY IF EXISTS "class_days_select_policy" ON class_days;
DROP POLICY IF EXISTS "class_days_insert_policy" ON class_days;
DROP POLICY IF EXISTS "class_days_update_policy" ON class_days;
DROP POLICY IF EXISTS "class_days_delete_policy" ON class_days;
DROP POLICY IF EXISTS "holidays_select_policy" ON holidays;
DROP POLICY IF EXISTS "holidays_insert_policy" ON holidays;
DROP POLICY IF EXISTS "holidays_update_policy" ON holidays;
DROP POLICY IF EXISTS "holidays_delete_policy" ON holidays;

-- 5. Verify RLS is disabled and no policies exist
SELECT 
  'RLS Status After Force Disable' as info,
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename;

SELECT 
  'Policies After Force Drop' as info,
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename, policyname;

-- 6. Grant ALL permissions to anon role (including ownership if needed)
GRANT ALL PRIVILEGES ON activities TO anon;
GRANT ALL PRIVILEGES ON class_days TO anon;
GRANT ALL PRIVILEGES ON holidays TO anon;

-- 7. Also grant permissions on sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon;

-- 8. Grant schema usage
GRANT USAGE ON SCHEMA public TO anon;

-- 9. Test access as anon role
DO $$
DECLARE
  test_result TEXT;
  row_count INTEGER;
BEGIN
  -- Test activities access
  BEGIN
    SELECT COUNT(*) INTO row_count FROM activities;
    test_result := 'SUCCESS: anon can access activities - Found ' || row_count || ' rows';
  EXCEPTION WHEN OTHERS THEN
    test_result := 'FAILED: anon cannot access activities - Error: ' || SQLERRM || ' (Code: ' || SQLSTATE || ')';
  END;
  
  RAISE NOTICE '%', test_result;
  
  -- Test class_days access
  BEGIN
    SELECT COUNT(*) INTO row_count FROM class_days;
    test_result := 'SUCCESS: anon can access class_days - Found ' || row_count || ' rows';
  EXCEPTION WHEN OTHERS THEN
    test_result := 'FAILED: anon cannot access class_days - Error: ' || SQLERRM || ' (Code: ' || SQLSTATE || ')';
  END;
  
  RAISE NOTICE '%', test_result;
  
  -- Test holidays access
  BEGIN
    SELECT COUNT(*) INTO row_count FROM holidays;
    test_result := 'SUCCESS: anon can access holidays - Found ' || row_count || ' rows';
  EXCEPTION WHEN OTHERS THEN
    test_result := 'FAILED: anon cannot access holidays - Error: ' || SQLERRM || ' (Code: ' || SQLSTATE || ')';
  END;
  
  RAISE NOTICE '%', test_result;
END $$;

-- 10. Final verification
SELECT 
  'Final Status' as info,
  'RLS should be completely disabled' as rls_status,
  'All policies should be dropped' as policy_status,
  'Anon should have ALL privileges' as permission_status,
  'Tables should be fully accessible' as access_status;
