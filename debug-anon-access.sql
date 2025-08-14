-- Debug why anon role still can't access tables despite permissions being granted
-- This will help us understand what's blocking access

-- 1. Check if we're actually running as anon role
SELECT 
  'Current Role Check' as info,
  current_user as current_role,
  session_user as session_role,
  CASE 
    WHEN current_user = 'anon' THEN 'Running as anon - Good for testing'
    ELSE 'Running as ' || current_user || ' - Need to test as anon'
  END as role_status;

-- 2. Check if anon role actually exists and has the right permissions
SELECT 
  'Anon Role Details' as info,
  rolname as role_name,
  rolsuper as is_superuser,
  rolinherit as inherits_privileges,
  rolcanlogin as can_login,
  rolbypassrls as bypasses_rls
FROM pg_roles 
WHERE rolname = 'anon';

-- 3. Check exact table permissions for anon role
SELECT 
  'Table Permissions for Anon' as info,
  schemaname,
  tablename,
  tableowner,
  rowsecurity as rls_enabled,
  hasindexes,
  hasrules,
  hastriggers
FROM pg_tables 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename;

-- 4. Check if there are any RLS policies that might still be active
SELECT 
  'RLS Policies Check' as info,
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd,
  qual
FROM pg_policies 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename, policyname;

-- 5. Check if there are any triggers that might be blocking access
SELECT 
  'Triggers Check' as info,
  trigger_name,
  event_manipulation,
  action_statement,
  action_timing
FROM information_schema.triggers 
WHERE event_object_table IN ('activities', 'class_days', 'holidays')
ORDER BY event_object_table, trigger_name;

-- 6. Check if there are any rules that might be blocking access
SELECT 
  'Rules Check' as info,
  schemaname,
  tablename,
  rulename,
  definition
FROM pg_rules 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename, rulename;

-- 7. Check if there are any views that might be interfering
SELECT 
  'Views Check' as info,
  table_name,
  view_definition
FROM information_schema.views 
WHERE table_name IN ('activities', 'class_days', 'holidays');

-- 8. Check if there are any foreign key constraints that might be causing issues
SELECT 
  'Foreign Key Check' as info,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('activities', 'class_days', 'holidays')
ORDER BY tc.table_name, kcu.column_name;

-- 9. Try to access tables directly and see what error we get
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

-- 10. Check if there are any database-level restrictions
SELECT 
  'Database Restrictions' as info,
  'Check if database has any restrictions' as note,
  current_database() as current_db,
  current_setting('search_path') as search_path;

-- 11. Check if there are any role-based restrictions
SELECT 
  'Role Restrictions' as info,
  rolname,
  rolconfig
FROM pg_roles 
WHERE rolname = 'anon' 
  AND rolconfig IS NOT NULL;

-- 12. Final diagnosis
SELECT 
  'Diagnosis Summary' as info,
  CASE 
    WHEN current_user != 'anon' THEN 'Testing as wrong role - need to test as anon'
    WHEN EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('activities', 'class_days', 'holidays')) THEN 'RLS policies still exist - need to drop them'
    WHEN EXISTS (SELECT 1 FROM information_schema.triggers WHERE event_object_table IN ('activities', 'class_days', 'holidays')) THEN 'Triggers might be blocking access'
    ELSE 'Unknown issue - check error messages above'
  END as diagnosis,
  'Next: Look at specific error messages from the access tests' as next_step;
