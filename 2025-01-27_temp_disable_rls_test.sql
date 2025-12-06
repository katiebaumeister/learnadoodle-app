-- TEMPORARY: Disable RLS to test if that's the issue
-- This will help us determine if RLS is causing the 400 errors

-- Check current RLS status
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'children';

-- Option 1: Temporarily disable RLS (for testing only - re-enable after!)
-- ALTER TABLE children DISABLE ROW LEVEL SECURITY;

-- Option 2: Create a permissive policy that allows all authenticated users
-- (This is safer than disabling RLS completely)

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view family children" ON children;
DROP POLICY IF EXISTS "Users can update family children" ON children;
DROP POLICY IF EXISTS "Users can insert family children" ON children;
DROP POLICY IF EXISTS "Users can delete family children" ON children;

-- Create very permissive policies for testing
CREATE POLICY "temp_allow_all_select" ON children
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "temp_allow_all_update" ON children
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "temp_allow_all_insert" ON children
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "temp_allow_all_delete" ON children
    FOR DELETE
    TO authenticated
    USING (true);

-- Verify
SELECT 
    policyname,
    cmd
FROM pg_policies
WHERE tablename = 'children';




