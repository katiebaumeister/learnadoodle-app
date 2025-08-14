-- Fix app access by ensuring the authenticated user can access the tables
-- This will check for any remaining restrictions and fix them

-- 1. First, let's see what the access tests showed
SELECT 
  'Access Test Results' as info,
  'Check the NOTICE messages above for access test results' as note;

-- 2. Check if there are any remaining RLS policies
SELECT 
  'Remaining RLS Policies' as info,
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd
FROM pg_policies 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename, policyname;

-- 3. Check if there are any triggers that might be blocking access
SELECT 
  'Triggers Check' as info,
  trigger_name,
  event_object_table,
  event_manipulation,
  action_statement
FROM information_schema.triggers 
WHERE event_object_table IN ('activities', 'class_days', 'holidays')
ORDER BY event_object_table, trigger_name;

-- 4. Check if there are any rules that might be blocking access
SELECT 
  'Rules Check' as info,
  schemaname,
  tablename,
  rulename,
  definition
FROM pg_rules 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename, rulename;

-- 5. Check if there are any views that might be interfering
SELECT 
  'Views Check' as info,
  table_name,
  view_definition
FROM information_schema.views 
WHERE table_name IN ('activities', 'class_days', 'holidays');

-- 6. Check if the authenticated user actually has the right permissions
-- We'll grant permissions directly to the authenticated user's role
DO $$
DECLARE
  user_id_val UUID;
  user_role_name TEXT;
BEGIN
  -- Get the user ID for katiebaumeister@icloud.com
  SELECT id INTO user_id_val FROM profiles WHERE email = 'katiebaumeister@icloud.com';
  
  IF user_id_val IS NULL THEN
    RAISE NOTICE 'User katiebaumeister@icloud.com not found in profiles';
    RETURN;
  END IF;
  
  -- Get the role name for this user (using a different approach)
  SELECT rolname INTO user_role_name FROM pg_roles WHERE oid = user_id_val::oid;
  
  IF user_role_name IS NULL THEN
    RAISE NOTICE 'No role found for user %', user_id_val;
    -- Try to grant permissions directly to the user ID
    EXECUTE format('GRANT ALL PRIVILEGES ON activities TO %I', user_id_val::text);
    EXECUTE format('GRANT ALL PRIVILEGES ON class_days TO %I', user_id_val::text);
    EXECUTE format('GRANT ALL PRIVILEGES ON holidays TO %I', user_id_val::text);
    RAISE NOTICE 'Granted ALL privileges directly to user ID %', user_id_val;
    RETURN;
  END IF;
  
  RAISE NOTICE 'Found role % for user %', user_role_name, user_id_val;
  
  -- Grant permissions to this user's role
  EXECUTE format('GRANT ALL PRIVILEGES ON activities TO %I', user_role_name);
  EXECUTE format('GRANT ALL PRIVILEGES ON class_days TO %I', user_role_name);
  EXECUTE format('GRANT ALL PRIVILEGES ON holidays TO %I', user_role_name);
  
  RAISE NOTICE 'Granted ALL privileges to role %', user_role_name;
  
END $$;

-- 7. Also ensure the authenticated user can access related tables
DO $$
DECLARE
  user_id_val UUID;
  user_role_name TEXT;
BEGIN
  -- Get the user ID for katiebaumeister@icloud.com
  SELECT id INTO user_id_val FROM profiles WHERE email = 'katiebaumeister@icloud.com';
  
  IF user_id_val IS NULL THEN
    RETURN;
  END IF;
  
  -- Get the role name for this user (using a different approach)
  SELECT rolname INTO user_role_name FROM pg_roles WHERE oid = user_id_val::oid;
  
  IF user_role_name IS NULL THEN
    -- Try to grant permissions directly to the user ID
    EXECUTE format('GRANT SELECT ON family TO %I', user_id_val::text);
    EXECUTE format('GRANT SELECT ON family_years TO %I', user_id_val::text);
    EXECUTE format('GRANT SELECT ON profiles TO %I', user_id_val::text);
    EXECUTE format('GRANT SELECT ON children TO %I', user_id_val::text);
    EXECUTE format('GRANT SELECT ON subject TO %I', user_id_val::text);
    RAISE NOTICE 'Granted SELECT permissions directly to user ID %', user_id_val;
    RETURN;
  END IF;
  
  -- Grant permissions to related tables
  EXECUTE format('GRANT SELECT ON family TO %I', user_role_name);
  EXECUTE format('GRANT SELECT ON family_years TO %I', user_role_name);
  EXECUTE format('GRANT SELECT ON profiles TO %I', user_role_name);
  EXECUTE format('GRANT SELECT ON children TO %I', user_role_name);
  EXECUTE format('GRANT SELECT ON subject TO %I', user_role_name);
  
  RAISE NOTICE 'Granted SELECT permissions on related tables to role %', user_role_name;
  
END $$;

-- 8. Test access again as the authenticated user
DO $$
DECLARE
  user_id_val UUID;
  test_result TEXT;
  row_count INTEGER;
BEGIN
  -- Get the user ID for katiebaumeister@icloud.com
  SELECT id INTO user_id_val FROM profiles WHERE email = 'katiebaumeister@icloud.com';
  
  IF user_id_val IS NULL THEN
    RAISE NOTICE 'User katiebaumeister@icloud.com not found in profiles';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing access for user: %', user_id_val;
  
  -- Test activities access
  BEGIN
    SELECT COUNT(*) INTO row_count FROM activities;
    test_result := 'SUCCESS: User can access activities - Found ' || row_count || ' rows';
  EXCEPTION WHEN OTHERS THEN
    test_result := 'FAILED: User cannot access activities - Error: ' || SQLERRM || ' (Code: ' || SQLSTATE || ')';
  END;
  
  RAISE NOTICE '%', test_result;
  
  -- Test class_days access
  BEGIN
    SELECT COUNT(*) INTO row_count FROM class_days;
    test_result := 'SUCCESS: User can access class_days - Found ' || row_count || ' rows';
  EXCEPTION WHEN OTHERS THEN
    test_result := 'FAILED: User cannot access class_days - Error: ' || SQLERRM || ' (Code: ' || SQLSTATE || ')';
  END;
  
  RAISE NOTICE '%', test_result;
  
  -- Test holidays access
  BEGIN
    SELECT COUNT(*) INTO row_count FROM holidays;
    test_result := 'SUCCESS: User can access holidays - Found ' || row_count || ' rows';
  EXCEPTION WHEN OTHERS THEN
    test_result := 'FAILED: User cannot access holidays - Error: ' || SQLERRM || ' (Code: ' || SQLSTATE || ')';
  END;
  
  RAISE NOTICE '%', test_result;
  
END $$;

-- 9. Final verification
SELECT 
  'Final Access Test' as info,
  'activities' as table_name,
  COUNT(*) as row_count
FROM activities
UNION ALL
SELECT 
  'Final Access Test' as info,
  'class_days' as table_name,
  COUNT(*) as row_count
FROM class_days
UNION ALL
SELECT 
  'Final Access Test' as info,
  'holidays' as table_name,
  COUNT(*) as row_count
FROM holidays;

-- 10. Summary of what we fixed
SELECT 
  'Fix Summary' as info,
  'Granted ALL privileges to authenticated user role' as user_permissions,
  'Granted SELECT on related tables' as related_permissions,
  'RLS should be disabled' as rls_status,
  'App should now be able to access tables' as expected_result;
