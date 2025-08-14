-- Fix activities table permissions - run this in your Supabase SQL editor
-- This will ensure the activities table is accessible to authenticated users

-- First, let's check what columns actually exist in the activities table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'activities' 
ORDER BY ordinal_position;

-- Disable RLS temporarily to see what's in the table
ALTER TABLE activities DISABLE ROW LEVEL SECURITY;

-- Drop any existing policies that might be causing issues
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON activities;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON activities;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON activities;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON activities;

-- Create a simple policy that allows all authenticated users to access activities
CREATE POLICY "Enable all access for authenticated users" ON activities
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Re-enable RLS
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Test the access
SELECT COUNT(*) FROM activities;

-- If you want to be more restrictive, you can use this instead:
-- CREATE POLICY "Enable read access for authenticated users" ON activities
--     FOR SELECT
--     TO authenticated
--     USING (true);
-- 
-- CREATE POLICY "Enable insert access for authenticated users" ON activities
--     FOR INSERT
--     TO authenticated
--     WITH CHECK (true);
-- 
-- CREATE POLICY "Enable update access for authenticated users" ON activities
--     FOR UPDATE
--     TO authenticated
--     USING (true)
--     WITH CHECK (true);
-- 
-- CREATE POLICY "Enable delete access for authenticated users" ON activities
--     FOR DELETE
--     TO authenticated
--     USING (true);
