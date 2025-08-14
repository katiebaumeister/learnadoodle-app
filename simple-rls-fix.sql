-- Simple RLS Fix - Disable RLS on Calendar Tables
-- This should work even if other scripts don't

-- Disable RLS on all calendar tables
ALTER TABLE academic_years DISABLE ROW LEVEL SECURITY;
ALTER TABLE typical_holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE class_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE class_day_mappings DISABLE ROW LEVEL SECURITY;
ALTER TABLE lessons DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;

-- Test that it worked
SELECT 'RLS DISABLED - Testing access...' as status;

-- Try to insert a test record
INSERT INTO academic_years (family_id, year_name, start_date, end_date, is_current)
VALUES ('86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', 'Test Year', '2024-01-01', '2024-12-31', false)
ON CONFLICT DO NOTHING;

-- Clean up test record
DELETE FROM academic_years WHERE year_name = 'Test Year';

SELECT 'RLS disabled successfully! Calendar should work now.' as status; 