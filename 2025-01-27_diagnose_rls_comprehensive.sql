-- Comprehensive RLS Diagnostic Script
-- This will help us identify the exact issue

-- 1. Check if RLS is enabled
SELECT 
    'RLS Status' as check_type,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'children';

-- 2. List all policies
SELECT 
    'Policies' as check_type,
    policyname,
    cmd as command,
    qual as using_expression,
    with_check as with_check_expression
FROM pg_policies
WHERE tablename = 'children';

-- 3. Check if helper function exists
SELECT 
    'Helper Function' as check_type,
    proname as function_name,
    pg_get_functiondef(oid) as function_definition
FROM pg_proc
WHERE proname = 'user_has_family_access';

-- 4. Test auth context (run as authenticated user)
-- This will show if auth.uid() is available
SELECT 
    'Auth Context' as check_type,
    auth.uid() as current_user_id,
    auth.role() as current_role;

-- 5. Check profiles table structure
SELECT 
    'Profiles Table' as check_type,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;

-- 6. Check children table structure
SELECT 
    'Children Table' as check_type,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'children'
ORDER BY ordinal_position;

-- 7. Count children by family (if accessible)
SELECT 
    'Children Count' as check_type,
    family_id,
    COUNT(*) as child_count
FROM children
GROUP BY family_id;

-- 8. Test the RLS policy directly (simulate what happens)
-- This will fail if RLS is blocking
DO $$
DECLARE
    test_user_id uuid;
    test_family_id uuid;
    child_count integer;
BEGIN
    -- Get a test user and their family_id
    SELECT id, family_id INTO test_user_id, test_family_id
    FROM profiles
    LIMIT 1;
    
    IF test_user_id IS NULL THEN
        RAISE NOTICE 'No users found in profiles table';
        RETURN;
    END IF;
    
    RAISE NOTICE 'Testing with user: %', test_user_id;
    RAISE NOTICE 'Family ID: %', test_family_id;
    
    -- Try to count children (this will be blocked by RLS if policy is wrong)
    SELECT COUNT(*) INTO child_count
    FROM children
    WHERE family_id = test_family_id;
    
    RAISE NOTICE 'Children count for family: %', child_count;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ERROR testing RLS: %', SQLERRM;
END $$;




