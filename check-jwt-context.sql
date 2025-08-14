-- Check JWT authentication context to see what role the app is actually using
-- This will help us understand how Supabase is processing the authentication

-- 1. Check current JWT context
SELECT 
  'JWT Context Check' as info,
  'Current SQL User' as context,
  current_user as user_name,
  'SQL Editor' as source
UNION ALL
SELECT 
  'JWT Context Check' as info,
  'JWT Claims' as context,
  current_setting('request.jwt.claims', true) as user_name,
  'JWT Token' as source;

-- 2. Check if there are any Supabase-specific authentication mechanisms
SELECT 
  'Supabase Auth Check' as info,
  'Check for any Supabase-specific authentication' as note;

-- 3. Check if there are any database-level authentication functions
SELECT 
  'Auth Functions Check' as info,
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines 
WHERE routine_name LIKE '%auth%' 
   OR routine_name LIKE '%jwt%'
   OR routine_name LIKE '%supabase%'
ORDER BY routine_name;

-- 4. Check if there are any authentication triggers
SELECT 
  'Auth Triggers Check' as info,
  trigger_name,
  event_object_table,
  event_manipulation,
  action_statement
FROM information_schema.triggers 
WHERE trigger_name LIKE '%auth%'
   OR trigger_name LIKE '%jwt%'
   OR trigger_name LIKE '%supabase%'
ORDER BY trigger_name;

-- 5. Check if there are any authentication policies we missed
SELECT 
  'Auth Policies Check' as info,
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd,
  qual
FROM pg_policies 
WHERE policyname LIKE '%auth%'
   OR policyname LIKE '%jwt%'
   OR policyname LIKE '%supabase%'
   OR qual LIKE '%auth%'
   OR qual LIKE '%jwt%'
   OR qual LIKE '%supabase%'
ORDER BY tablename, policyname;

-- 6. Check if there are any authentication rules
SELECT 
  'Auth Rules Check' as info,
  schemaname,
  tablename,
  rulename,
  definition
FROM pg_rules 
WHERE rulename LIKE '%auth%'
   OR rulename LIKE '%jwt%'
   OR rulename LIKE '%supabase%'
   OR definition LIKE '%auth%'
   OR definition LIKE '%jwt%'
   OR definition LIKE '%supabase%'
ORDER BY tablename, rulename;

-- 7. Check if there are any authentication views
SELECT 
  'Auth Views Check' as info,
  table_name,
  view_definition
FROM information_schema.views 
WHERE table_name LIKE '%auth%'
   OR table_name LIKE '%jwt%'
   OR table_name LIKE '%supabase%'
   OR view_definition LIKE '%auth%'
   OR view_definition LIKE '%jwt%'
   OR view_definition LIKE '%supabase%';

-- 8. Check if there are any authentication constraints
SELECT 
  'Auth Constraints Check' as info,
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_name LIKE '%auth%'
   OR tc.constraint_name LIKE '%jwt%'
   OR tc.constraint_name LIKE '%supabase%'
ORDER BY tc.table_name, tc.constraint_name;

-- 9. Check if there are any authentication sequences
SELECT 
  'Auth Sequences Check' as info,
  sequence_name,
  data_type,
  start_value,
  minimum_value,
  maximum_value
FROM information_schema.sequences 
WHERE sequence_name LIKE '%auth%'
   OR sequence_name LIKE '%jwt%'
   OR sequence_name LIKE '%supabase%'
ORDER BY sequence_name;

-- 10. Check if there are any authentication schemas
SELECT 
  'Auth Schemas Check' as info,
  schema_name,
  schema_owner
FROM information_schema.schemata 
WHERE schema_name LIKE '%auth%'
   OR schema_name LIKE '%jwt%'
   OR schema_name LIKE '%supabase%'
ORDER BY schema_name;

-- 11. Final diagnosis
SELECT 
  'JWT Authentication Diagnosis' as info,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name LIKE '%auth%') THEN 'Auth functions found - might be blocking access'
    WHEN EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name LIKE '%auth%') THEN 'Auth triggers found - might be blocking access'
    WHEN EXISTS (SELECT 1 FROM pg_policies WHERE policyname LIKE '%auth%') THEN 'Auth policies found - might be blocking access'
    WHEN EXISTS (SELECT 1 FROM pg_rules WHERE rulename LIKE '%auth%') THEN 'Auth rules found - might be blocking access'
    ELSE 'No obvious auth mechanisms found - issue might be in Supabase configuration'
  END as diagnosis,
  'Next: Check Supabase project settings for authentication restrictions' as next_step;
