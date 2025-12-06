-- Verify and Fix RLS policies for children table
-- Run this to ensure all policies are correctly set up

-- 1. Check if RLS is enabled
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = 'children' 
        AND rowsecurity = true
    ) THEN
        ALTER TABLE children ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'RLS enabled on children table';
    ELSE
        RAISE NOTICE 'RLS already enabled on children table';
    END IF;
END $$;

-- 2. Drop all existing policies (to ensure clean state)
DROP POLICY IF EXISTS "Users can view family children" ON children;
DROP POLICY IF EXISTS "Users can update family children" ON children;
DROP POLICY IF EXISTS "Users can insert family children" ON children;
DROP POLICY IF EXISTS "Users can delete family children" ON children;
DROP POLICY IF EXISTS "children_select_policy" ON children;
DROP POLICY IF EXISTS "children_insert_policy" ON children;
DROP POLICY IF EXISTS "children_update_policy" ON children;
DROP POLICY IF EXISTS "children_delete_policy" ON children;

-- 3. Grant permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON children TO authenticated;
GRANT ALL ON children TO service_role;

-- 4. Create SELECT policy - users can view children in their family
CREATE POLICY "Users can view family children" ON children
    FOR SELECT
    TO authenticated
    USING (
        family_id IN (
            SELECT family_id 
            FROM profiles 
            WHERE id = auth.uid()
        )
    );

-- 5. Create UPDATE policy - users can update children in their family
CREATE POLICY "Users can update family children" ON children
    FOR UPDATE
    TO authenticated
    USING (
        family_id IN (
            SELECT family_id 
            FROM profiles 
            WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        family_id IN (
            SELECT family_id 
            FROM profiles 
            WHERE id = auth.uid()
        )
    );

-- 6. Create INSERT policy - users can insert children into their family
CREATE POLICY "Users can insert family children" ON children
    FOR INSERT
    TO authenticated
    WITH CHECK (
        family_id IN (
            SELECT family_id 
            FROM profiles 
            WHERE id = auth.uid()
        )
    );

-- 7. Create DELETE policy - users can delete children from their family
CREATE POLICY "Users can delete family children" ON children
    FOR DELETE
    TO authenticated
    USING (
        family_id IN (
            SELECT family_id 
            FROM profiles 
            WHERE id = auth.uid()
        )
    );

-- 8. Ensure archived column exists and has default
DO $$
BEGIN
    -- Check if archived column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'children' 
        AND column_name = 'archived'
    ) THEN
        ALTER TABLE children ADD COLUMN archived boolean DEFAULT false;
        RAISE NOTICE 'Added archived column to children table';
    ELSE
        -- Ensure it has a default value
        ALTER TABLE children ALTER COLUMN archived SET DEFAULT false;
        RAISE NOTICE 'Ensured archived column has default value';
    END IF;
    
    -- Update any NULL values
    UPDATE children SET archived = false WHERE archived IS NULL;
END $$;

-- 9. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_children_family_id ON children(family_id);
CREATE INDEX IF NOT EXISTS idx_children_archived ON children(archived) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_children_family_archived ON children(family_id, archived) WHERE archived = false;

-- 10. Verify policies were created
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = 'children';
    
    IF policy_count >= 4 THEN
        RAISE NOTICE 'Successfully created % policies on children table', policy_count;
    ELSE
        RAISE WARNING 'Expected 4 policies but found %', policy_count;
    END IF;
END $$;

