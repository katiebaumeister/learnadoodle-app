-- Most Permissive RLS Fix - This should definitely work
-- Uses the simplest possible policy that allows authenticated users to access their family's children

-- 1. Ensure RLS is enabled
ALTER TABLE children ENABLE ROW LEVEL SECURITY;

-- 2. Drop ALL existing policies (clean slate)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'children') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON children';
    END LOOP;
END $$;

-- 3. Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON children TO authenticated;
GRANT ALL ON children TO service_role;

-- 4. Create the simplest possible SELECT policy
-- This checks if the user's profile has the same family_id as the child
CREATE POLICY "children_select_simple" ON children
    FOR SELECT
    TO authenticated
    USING (
        family_id IN (
            SELECT family_id 
            FROM profiles 
            WHERE id = auth.uid()
        )
    );

-- 5. Create UPDATE policy
CREATE POLICY "children_update_simple" ON children
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

-- 6. Create INSERT policy
CREATE POLICY "children_insert_simple" ON children
    FOR INSERT
    TO authenticated
    WITH CHECK (
        family_id IN (
            SELECT family_id 
            FROM profiles 
            WHERE id = auth.uid()
        )
    );

-- 7. Create DELETE policy
CREATE POLICY "children_delete_simple" ON children
    FOR DELETE
    TO authenticated
    USING (
        family_id IN (
            SELECT family_id 
            FROM profiles 
            WHERE id = auth.uid()
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

-- 10. Verify
SELECT 
    'Verification' as check_type,
    COUNT(*) as policy_count,
    (SELECT rowsecurity FROM pg_tables WHERE tablename = 'children') as rls_enabled
FROM pg_policies
WHERE tablename = 'children';




