-- Check for any Supabase-specific security settings that might be blocking access
-- This will help us understand if there are project-level restrictions

-- 1. Check if there are any remaining RLS policies on ANY tables
SELECT 
  'All RLS Policies Check' as info,
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd
FROM pg_policies 
ORDER BY tablename, policyname;

-- 2. Check if there are any RLS-enabled tables
SELECT 
  'RLS Enabled Tables' as info,
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE rowsecurity = true
ORDER BY tablename;

-- 3. Check if there are any database-level restrictions
SELECT 
  'Database Restrictions' as info,
  'Check for any database-wide security settings' as note;

-- 4. Check if there are any role-based restrictions
SELECT 
  'Role Restrictions' as info,
  rolname,
  rolsuper as is_superuser,
  rolinherit as inherits_privileges,
  rolcreaterole as can_create_roles,
  rolcreatedb as can_create_databases,
  rolcanlogin as can_login,
  rolbypassrls as bypasses_rls,
  rolconfig
FROM pg_roles 
WHERE rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY rolname;

-- 5. Check if there are any schema-level restrictions
SELECT 
  'Schema Restrictions' as info,
  schema_name,
  privilege_type,
  is_grantable
FROM information_schema.schema_privileges 
WHERE schema_name = 'public'
ORDER BY privilege_type;

-- 6. Check if there are any table-level restrictions for the specific tables
SELECT 
  'Table Restrictions' as info,
  table_name,
  privilege_type,
  is_grantable
FROM information_schema.table_privileges 
WHERE table_name IN ('activities', 'class_days', 'holidays')
ORDER BY table_name, privilege_type;

-- 7. Check if there are any column-level restrictions
SELECT 
  'Column Restrictions' as info,
  table_name,
  column_name,
  privilege_type,
  is_grantable
FROM information_schema.column_privileges 
WHERE table_name IN ('activities', 'class_days', 'holidays')
ORDER BY table_name, column_name;

-- 8. Check if there are any function-level restrictions
SELECT 
  'Function Restrictions' as info,
  routine_name,
  privilege_type,
  is_grantable
FROM information_schema.routine_privileges 
WHERE routine_name LIKE '%activities%'
   OR routine_name LIKE '%class_days%'
   OR routine_name LIKE '%holidays%'
ORDER BY routine_name, privilege_type;

-- 9. Check if there are any sequence-level restrictions
SELECT 
  'Sequence Restrictions' as info,
  sequence_name,
  privilege_type,
  is_grantable
FROM information_schema.sequence_privileges 
WHERE sequence_name LIKE '%activities%'
   OR sequence_name LIKE '%class_days%'
   OR sequence_name LIKE '%holidays%'
ORDER BY sequence_name, privilege_type;

-- 10. Check if there are any usage restrictions
SELECT 
  'Usage Restrictions' as info,
  'Check for any usage restrictions on the database' as note;

-- 11. Check if there are any connection restrictions
SELECT 
  'Connection Restrictions' as info,
  'Check for any connection-level restrictions' as note;

-- 12. Final diagnosis
SELECT 
  'Supabase Security Diagnosis' as info,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_policies) THEN 'RLS policies still exist - need to investigate further'
    WHEN EXISTS (SELECT 1 FROM pg_tables WHERE rowsecurity = true) THEN 'Some tables still have RLS enabled'
    WHEN EXISTS (SELECT 1 FROM information_schema.table_privileges WHERE table_name IN ('activities', 'class_days', 'holidays') AND privilege_type != 'SELECT') THEN 'Table permissions incomplete'
    ELSE 'No obvious security restrictions found - issue might be in Supabase configuration'
  END as diagnosis,
  'Next: Check Supabase project settings and try a different approach' as next_step;
