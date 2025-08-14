-- Test script to verify activities table access after disabling RLS
-- Run this to confirm the emergency fix worked

-- 1. Confirm RLS is disabled
SELECT 
  'RLS Status' as check_type,
  CASE 
    WHEN rowsecurity THEN 'ENABLED (still has issues)'
    ELSE 'DISABLED (should work now)'
  END as status
FROM pg_tables 
WHERE tablename = 'activities';

-- 2. Test basic access to activities table
SELECT 
  'Basic Access Test' as test_type,
  COUNT(*) as total_activities,
  CASE 
    WHEN COUNT(*) >= 0 THEN 'SUCCESS - Table accessible'
    ELSE 'FAILED - Still has issues'
  END as result
FROM activities;

-- 3. Check table structure
SELECT 
  'Table Structure' as info,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'activities'
ORDER BY ordinal_position;

-- 4. Check if there's any data
SELECT 
  'Data Check' as info,
  COUNT(*) as total_rows,
  CASE 
    WHEN COUNT(*) = 0 THEN 'Table is empty (this is normal for new tables)'
    ELSE 'Table has ' || COUNT(*) || ' rows'
  END as data_status
FROM activities;

-- 5. Test inserting a sample record (optional)
-- Uncomment the lines below if you want to test INSERT permissions
/*
INSERT INTO activities (family_id, name, subject_id, activity_type, schedule_data)
VALUES (
  (SELECT family_id FROM profiles WHERE id = auth.uid() LIMIT 1),
  'Test Activity',
  (SELECT id FROM subject LIMIT 1),
  'test',
  '{"status": "test"}'::jsonb
);

SELECT 'INSERT Test' as test_type, 'SUCCESS' as result;
*/
