-- Check the app's authentication context to see what role it's actually using
-- This will help us align the Supabase client permissions

-- 1. Check if the user exists in profiles
SELECT 
  'User Profile Check' as info,
  p.id as profile_id,
  p.email,
  p.family_id,
  CASE 
    WHEN p.id IS NULL THEN 'USER NOT FOUND IN PROFILES'
    WHEN p.family_id IS NULL THEN 'USER HAS NO FAMILY_ID'
    ELSE 'USER OK: ' || p.email
  END as status
FROM profiles p
WHERE p.email = 'katiebaumeister@icloud.com';

-- 2. Check if there are any RLS policies that might be active for this user
SELECT 
  'RLS Policies for User Tables' as info,
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd,
  qual
FROM pg_policies 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename, policyname;

-- 3. Check if the user has any special role assignments
SELECT 
  'User Role Check' as info,
  r.rolname as role_name,
  r.rolsuper as is_superuser,
  r.rolcanlogin as can_login
FROM pg_roles r
JOIN pg_auth_members m ON r.oid = m.roleid
JOIN pg_roles u ON m.member = u.oid
JOIN profiles p ON u.rolname = p.id::text
WHERE p.email = 'katiebaumeister@icloud.com';

-- 4. Check if there are any database-level restrictions for authenticated users
SELECT 
  'Database Restrictions for Auth Users' as info,
  'Check if authenticated users have different restrictions' as note;

-- 5. Test access as the authenticated user context
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

-- 6. Check if there are any Supabase-specific security settings
SELECT 
  'Supabase Security Check' as info,
  'Check for any Supabase-specific restrictions' as note;

-- 7. Final diagnosis
SELECT 
  'App Auth Context Diagnosis' as info,
  CASE 
    WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE email = 'katiebaumeister@icloud.com') THEN 'USER NOT IN PROFILES - Need to create profile'
    WHEN EXISTS (SELECT 1 FROM profiles WHERE email = 'katiebaumeister@icloud.com' AND family_id IS NULL) THEN 'USER HAS NO FAMILY_ID - Need to connect to family'
    WHEN EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('activities', 'class_days', 'holidays')) THEN 'RLS POLICIES STILL ACTIVE - Need to drop them'
    ELSE 'User profile looks OK - issue might be elsewhere'
  END as diagnosis,
  'Next: Check the specific error messages from the access tests' as next_step;
