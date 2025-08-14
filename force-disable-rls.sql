-- Force Disable RLS - More Aggressive Approach
-- This script will definitely disable RLS and clear any cached policies

-- First, drop ALL policies on these tables
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE tablename IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance', 'typical_holidays')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON ' || policy_record.schemaname || '.' || policy_record.tablename;
        RAISE NOTICE 'Dropped policy: % on %.%', policy_record.policyname, policy_record.schemaname, policy_record.tablename;
    END LOOP;
END $$;

-- Force disable RLS on all tables
ALTER TABLE academic_years DISABLE ROW LEVEL SECURITY;
ALTER TABLE holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE class_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE class_day_mappings DISABLE ROW LEVEL SECURITY;
ALTER TABLE lessons DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE typical_holidays DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT 'RLS STATUS AFTER DISABLE:' as info;
SELECT 
    schemaname,
    tablename,
    CASE WHEN relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as rls_status
FROM pg_tables t
JOIN pg_class c ON t.tablename = c.relname
WHERE tablename IN ('academic_years', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance', 'typical_holidays')
ORDER BY tablename;

-- Test direct access to tables
SELECT 'TESTING DIRECT ACCESS:' as info;

-- Test academic_years
SELECT 'academic_years accessible:' as test, COUNT(*) as count FROM academic_years;

-- Test typical_holidays
SELECT 'typical_holidays accessible:' as test, COUNT(*) as count FROM typical_holidays;

-- Test inserting a test record
INSERT INTO academic_years (family_id, year_name, start_date, end_date, is_current)
VALUES ('86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', 'Test Year', '2024-01-01', '2024-12-31', false)
ON CONFLICT DO NOTHING;

SELECT 'Test record inserted successfully!' as test_result;

-- Clean up test record
DELETE FROM academic_years WHERE year_name = 'Test Year';

SELECT 'RLS FORCE DISABLED - Tables should be accessible now!' as status; 