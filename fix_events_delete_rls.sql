-- Fix RLS policies to allow DELETE operations on events
-- The issue is that DELETE is returning success but not actually deleting

-- Step 1: Check current policies
DO $$
DECLARE
  pol_record RECORD;
BEGIN
  RAISE NOTICE 'Current RLS policies on events:';
  FOR pol_record IN
    SELECT policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE tablename = 'events'
  LOOP
    RAISE NOTICE 'Policy: %, Command: %, Qual: %, With Check: %', 
      pol_record.policyname, 
      pol_record.cmd, 
      pol_record.qual, 
      pol_record.with_check;
  END LOOP;
END $$;

-- Step 2: Drop existing DELETE policies that might be too restrictive
DROP POLICY IF EXISTS "Users can manage events for their families" ON events;
DROP POLICY IF EXISTS "allow_all_write" ON events;
DROP POLICY IF EXISTS "family write" ON events;
DROP POLICY IF EXISTS "events_delete_policy" ON events;

-- Step 3: Create comprehensive policies that allow DELETE
-- Policy for SELECT (read)
CREATE POLICY "events_select_policy" ON events
  FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Policy for INSERT (create)
CREATE POLICY "events_insert_policy" ON events
  FOR INSERT
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Policy for UPDATE (modify)
CREATE POLICY "events_update_policy" ON events
  FOR UPDATE
  USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Policy for DELETE (remove) - THIS IS THE KEY ONE
CREATE POLICY "events_delete_policy" ON events
  FOR DELETE
  USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Step 4: Verify RLS is enabled
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Step 5: Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON events TO anon;

-- Step 6: Verify policies were created
DO $$
DECLARE
  policy_count int;
  pol_record RECORD;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'events';
  
  RAISE NOTICE 'Created % policies on events table', policy_count;
  
  -- List all policies
  FOR pol_record IN
    SELECT policyname, cmd
    FROM pg_policies
    WHERE tablename = 'events'
    ORDER BY cmd, policyname
  LOOP
    RAISE NOTICE 'Policy: % (Command: %)', pol_record.policyname, pol_record.cmd;
  END LOOP;
END $$;
