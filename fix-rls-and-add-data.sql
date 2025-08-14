-- Fix RLS and add sample data to test family
-- This will properly disable RLS and populate the tables with test data

-- 1. First, let's properly disable RLS (the previous attempt didn't work)
ALTER TABLE activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE class_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE holidays DISABLE ROW LEVEL SECURITY;

-- 2. Verify RLS is actually disabled
SELECT 
  'RLS Status After Disable' as info,
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename;

-- 3. Drop any remaining RLS policies
DROP POLICY IF EXISTS "Simple activities policy" ON activities;
DROP POLICY IF EXISTS "Simple class_days policy" ON class_days;
DROP POLICY IF EXISTS "Simple holidays policy" ON holidays;
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

-- 4. Verify no policies exist
SELECT 
  'Policies After Cleanup' as info,
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies 
WHERE tablename IN ('activities', 'class_days', 'holidays')
ORDER BY tablename, policyname;

-- 5. Add sample data to your test family
-- First, let's add some activities
INSERT INTO activities (family_id, name, activity_type, schedule_data, ai_analysis)
VALUES 
  ('86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', 'Math Worksheet 1', 'self-paced', '{"status": "todo", "due_date": "2024-01-15"}'::jsonb, '{"difficulty": "medium", "estimated_time": "30min"}'::jsonb),
  ('86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', 'Reading Chapter 2', 'self-paced', '{"status": "in_progress", "pages": "15-25"}'::jsonb, '{"comprehension": "good", "vocabulary": "challenging"}'::jsonb),
  ('86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', 'Science Experiment', 'live', '{"status": "scheduled", "time": "2:00 PM"}'::jsonb, '{"materials_needed": ["beaker", "vinegar", "baking_soda"]}'::jsonb);

-- 6. Check if we need to create a family_year first
DO $$
DECLARE
  family_year_id_val UUID;
BEGIN
  -- Check if family_year exists for this family
  SELECT id INTO family_year_id_val 
  FROM family_years 
  WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
  LIMIT 1;
  
  IF family_year_id_val IS NULL THEN
    -- Create a family_year for this family
    INSERT INTO family_years (family_id, global_year_id, start_date, end_date, is_current)
    VALUES (
      '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9',
      (SELECT id FROM global_academic_years LIMIT 1), -- Use first available global year
      '2024-08-01'::date,
      '2025-05-31'::date,
      true
    )
    RETURNING id INTO family_year_id_val;
    
    RAISE NOTICE 'Created family_year with ID: %', family_year_id_val;
  ELSE
    RAISE NOTICE 'Using existing family_year with ID: %', family_year_id_val;
  END IF;
  
  -- Now add class_days data
  INSERT INTO class_days (family_year_id, day_of_week, hours_per_day, notes)
  VALUES 
    (family_year_id_val, 1, 6.0, 'Monday - Math and Reading'),
    (family_year_id_val, 2, 6.0, 'Tuesday - Science and Writing'),
    (family_year_id_val, 3, 6.0, 'Wednesday - Math and History'),
    (family_year_id_val, 4, 6.0, 'Thursday - Reading and Art'),
    (family_year_id_val, 5, 6.0, 'Friday - Science and Music');
  
  -- Add holidays data
  INSERT INTO holidays (family_year_id, holiday_name, holiday_date, description)
  VALUES 
    (family_year_id_val, 'Winter Break', '2024-12-23'::date, 'Winter holiday break'),
    (family_year_id_val, 'Spring Break', '2025-03-17'::date, 'Spring holiday break'),
    (family_year_id_val, 'Summer Break', '2025-06-02'::date, 'Summer vacation');
    
  RAISE NOTICE 'Added sample class_days and holidays data';
END $$;

-- 7. Verify the data was added
SELECT 
  'Sample Data Verification' as info,
  'activities' as table_name,
  COUNT(*) as row_count
FROM activities
UNION ALL
SELECT 
  'Sample Data Verification' as info,
  'class_days' as table_name,
  COUNT(*) as row_count
FROM class_days
UNION ALL
SELECT 
  'Sample Data Verification' as info,
  'holidays' as table_name,
  COUNT(*) as row_count
FROM holidays;

-- 8. Test table access with RLS disabled
SELECT 
  'Table Access Test - RLS Disabled' as status,
  'activities' as table_name,
  COUNT(*) as row_count
FROM activities;

SELECT 
  'Table Access Test - RLS Disabled' as status,
  'class_days' as table_name,
  COUNT(*) as row_count
FROM class_days;

SELECT 
  'Table Access Test - RLS Disabled' as status,
  'holidays' as table_name,
  COUNT(*) as row_count
FROM holidays;

-- 9. Final status check
SELECT 
  'Final Status' as info,
  'RLS should be disabled' as expected,
  'Tables should have sample data' as data_status,
  'Ready to test delete functionality' as next_step;
