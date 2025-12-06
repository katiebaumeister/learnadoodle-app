-- Simple fix for children table RLS - most reliable approach
-- This uses a direct subquery that's been tested to work

-- 1. Ensure RLS is enabled
ALTER TABLE children ENABLE ROW LEVEL SECURITY;

-- 2. Drop all existing policies
DROP POLICY IF EXISTS "Users can view family children" ON children;
DROP POLICY IF EXISTS "Users can update family children" ON children;
DROP POLICY IF EXISTS "Users can insert family children" ON children;
DROP POLICY IF EXISTS "Users can delete family children" ON children;
DROP POLICY IF EXISTS "children_select_policy" ON children;
DROP POLICY IF EXISTS "children_insert_policy" ON children;
DROP POLICY IF EXISTS "children_update_policy" ON children;
DROP POLICY IF EXISTS "children_delete_policy" ON children;

-- 3. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON children TO authenticated;
GRANT ALL ON children TO service_role;

-- 4. Create SELECT policy - simple and direct
CREATE POLICY "Users can view family children" ON children
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 
            FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.family_id = children.family_id
        )
    );

-- 5. Create UPDATE policy
CREATE POLICY "Users can update family children" ON children
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 
            FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.family_id = children.family_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 
            FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.family_id = children.family_id
        )
    );

-- 6. Create INSERT policy
CREATE POLICY "Users can insert family children" ON children
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 
            FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.family_id = children.family_id
        )
    );

-- 7. Create DELETE policy
CREATE POLICY "Users can delete family children" ON children
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 
            FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.family_id = children.family_id
        )
    );

-- 8. Ensure archived column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'children' 
        AND column_name = 'archived'
    ) THEN
        ALTER TABLE children ADD COLUMN archived boolean DEFAULT false NOT NULL;
    ELSE
        ALTER TABLE children 
            ALTER COLUMN archived SET DEFAULT false,
            ALTER COLUMN archived SET NOT NULL;
        UPDATE children SET archived = false WHERE archived IS NULL;
    END IF;
END $$;

-- 9. Create indexes
CREATE INDEX IF NOT EXISTS idx_children_family_id ON children(family_id);
CREATE INDEX IF NOT EXISTS idx_children_archived ON children(archived) WHERE archived = false;

-- 10. Verify setup
SELECT 
    'RLS Enabled' as check_item,
    CASE WHEN rowsecurity THEN 'YES' ELSE 'NO' END as status
FROM pg_tables 
WHERE tablename = 'children'
UNION ALL
SELECT 
    'Policy Count' as check_item,
    COUNT(*)::text as status
FROM pg_policies
WHERE tablename = 'children';

