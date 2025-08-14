-- Check database-level permissions and restrictions that might be blocking access
-- This will help us understand why anon role still can't access tables despite our fixes

-- 1. Check what role the app is actually using
SELECT 
  'App Authentication Check' as info,
  'Current SQL User' as context,
  current_user as user_name,
  'SQL Editor' as source
UNION ALL
SELECT 
  'App Authentication Check' as info,
  'App Role' as context,
  'anon' as user_name,
  'App should use this role' as source;

-- 2. Check if there are any database-level restrictions on the anon role
SELECT 
  'Database Role Restrictions' as info,
  rolname,
  rolsuper as is_superuser,
  rolinherit as inherits_privileges,
  rolcreaterole as can_create_roles,
  rolcreatedb as can_create_databases,
  rolcanlogin as can_login,
  rolbypassrls as bypasses_rls,
  rolconfig
FROM pg_roles 
WHERE rolname = 'anon';

-- 3. Check if there are any database-level policies or restrictions
SELECT 
  'Database Policies' as info,
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd,
  qual
FROM pg_policies 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename, policyname;

-- 4. Check if there are any database-level grants that might be interfering
SELECT 
  'Database Grants' as info,
  grantee,
  table_name,
  privilege_type,
  is_grantable
FROM information_schema.table_privileges 
WHERE table_name IN ('activities', 'class_days', 'holidays')
ORDER BY table_name, privilege_type;

-- 5. Check if there are any database-level restrictions on the public schema
SELECT 
  'Schema Restrictions' as info,
  schema_name,
  privilege_type,
  is_grantable
FROM information_schema.schema_privileges 
WHERE schema_name = 'public';

-- 6. Check if there are any database-level triggers that might be blocking access
SELECT 
  'Database Triggers' as info,
  trigger_name,
  event_object_table,
  event_manipulation,
  action_statement,
  action_timing
FROM information_schema.triggers 
WHERE event_object_table IN ('activities', 'class_days', 'holidays')
ORDER BY event_object_table, trigger_name;

-- 7. Check if there are any database-level rules that might be blocking access
SELECT 
  'Database Rules' as info,
  schemaname,
  tablename,
  rulename,
  definition
FROM pg_rules 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename, rulename;

-- 8. Check if there are any database-level views that might be interfering
SELECT 
  'Database Views' as info,
  table_name,
  view_definition
FROM information_schema.views 
WHERE table_name IN ('activities', 'class_days', 'holidays');

-- 9. Check if there are any database-level foreign key constraints that might be causing issues
SELECT 
  'Foreign Key Constraints' as info,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule,
  rc.update_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('activities', 'class_days', 'holidays')
ORDER BY tc.table_name, kcu.column_name;

-- 10. Check if there are any database-level functions that might be blocking access
SELECT 
  'Database Functions' as info,
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines 
WHERE routine_definition LIKE '%activities%' 
   OR routine_definition LIKE '%class_days%' 
   OR routine_definition LIKE '%holidays%'
ORDER BY routine_name;

-- 11. Check if there are any database-level event triggers
SELECT 
  'Event Triggers' as info,
  evtname,
  evtevent,
  evtfname,
  evtowner
FROM pg_event_trigger;

-- 12. Check if there are any database-level row security policies at the database level
SELECT 
  'Database Row Security' as info,
  'Check if there are any database-wide RLS settings' as note;

-- 13. Final diagnosis
SELECT 
  'Database Permission Diagnosis' as info,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('activities', 'class_days', 'holidays')) THEN 'RLS policies still exist - need to investigate further'
    WHEN EXISTS (SELECT 1 FROM information_schema.triggers WHERE event_object_table IN ('activities', 'class_days', 'holidays')) THEN 'Triggers might be blocking access'
    WHEN EXISTS (SELECT 1 FROM pg_rules WHERE tablename IN ('activities', 'class_days', 'holidays')) THEN 'Rules might be blocking access'
    WHEN EXISTS (SELECT 1 FROM information_schema.views WHERE table_name IN ('activities', 'class_days', 'holidays')) THEN 'Views might be interfering'
    ELSE 'No obvious database-level restrictions found - issue might be elsewhere'
  END as diagnosis,
  'Next: Check if the issue is with Supabase configuration or app authentication' as next_step;
