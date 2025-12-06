-- Diagnose and fix children table RLS issues
-- This script will help identify the problem

-- 1. Check current RLS status
SELECT 
    tablename,
    rowsecurity as rls_enabled,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'children') as policy_count
FROM pg_tables 
WHERE tablename = 'children';

-- 2. List all existing policies
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'children';

-- 3. Check if archived column exists
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'children'
ORDER BY ordinal_position;

-- 4. Check if profiles have family_id (this is critical for RLS to work)
SELECT 
    COUNT(*) as total_profiles,
    COUNT(family_id) as profiles_with_family_id,
    COUNT(*) - COUNT(family_id) as profiles_without_family_id
FROM profiles;

-- 5. Check if there are any children without family_id
SELECT COUNT(*) as children_without_family_id
FROM children
WHERE family_id IS NULL;

-- 6. Sample some profiles to verify structure
SELECT id, family_id, email
FROM profiles
LIMIT 5;

-- 7. Sample some children to verify structure  
SELECT id, family_id, first_name, archived
FROM children
LIMIT 5;


-- 7. Now apply the fix (drop and recreate policies)
ALTER TABLE children ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view family children" ON children;
DROP POLICY IF EXISTS "Users can update family children" ON children;
DROP POLICY IF EXISTS "Users can insert family children" ON children;
DROP POLICY IF EXISTS "Users can delete family children" ON children;
DROP POLICY IF EXISTS "children_select_policy" ON children;
DROP POLICY IF EXISTS "children_insert_policy" ON children;
DROP POLICY IF EXISTS "children_update_policy" ON children;
DROP POLICY IF EXISTS "children_delete_policy" ON children;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON children TO authenticated;
GRANT ALL ON children TO service_role;

-- Create a simpler SELECT policy that handles NULL family_id
CREATE POLICY "Users can view family children" ON children
    FOR SELECT
    TO authenticated
    USING (
        family_id IS NOT NULL AND
        family_id IN (
            SELECT COALESCE(family_id, '00000000-0000-0000-0000-000000000000'::uuid)
            FROM profiles 
            WHERE id = auth.uid()
        )
    );

-- Create UPDATE policy
CREATE POLICY "Users can update family children" ON children
    FOR UPDATE
    TO authenticated
    USING (
        family_id IS NOT NULL AND
        family_id IN (
            SELECT COALESCE(family_id, '00000000-0000-0000-0000-000000000000'::uuid)
            FROM profiles 
            WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        family_id IS NOT NULL AND
        family_id IN (
            SELECT COALESCE(family_id, '00000000-0000-0000-0000-000000000000'::uuid)
            FROM profiles 
            WHERE id = auth.uid()
        )
    );

-- Create INSERT policy
CREATE POLICY "Users can insert family children" ON children
    FOR INSERT
    TO authenticated
    WITH CHECK (
        family_id IS NOT NULL AND
        family_id IN (
            SELECT COALESCE(family_id, '00000000-0000-0000-0000-000000000000'::uuid)
            FROM profiles 
            WHERE id = auth.uid()
        )
    );

-- Create DELETE policy
CREATE POLICY "Users can delete family children" ON children
    FOR DELETE
    TO authenticated
    USING (
        family_id IS NOT NULL AND
        family_id IN (
            SELECT COALESCE(family_id, '00000000-0000-0000-0000-000000000000'::uuid)
            FROM profiles 
            WHERE id = auth.uid()
        )
    );

-- Ensure archived column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'children' 
        AND column_name = 'archived'
    ) THEN
        ALTER TABLE children ADD COLUMN archived boolean DEFAULT false NOT NULL;
    ELSE
        ALTER TABLE children ALTER COLUMN archived SET DEFAULT false;
        UPDATE children SET archived = false WHERE archived IS NULL;
        ALTER TABLE children ALTER COLUMN archived SET NOT NULL;
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_children_family_id ON children(family_id);
CREATE INDEX IF NOT EXISTS idx_children_archived ON children(archived) WHERE archived = false;

-- Final verification
SELECT 
    'RLS Status' as check_type,
    CASE WHEN rowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as status
FROM pg_tables 
WHERE tablename = 'children'
UNION ALL
SELECT 
    'Policy Count' as check_type,
    COUNT(*)::text as status
FROM pg_policies
WHERE tablename = 'children';

