-- Final fix for children table RLS - uses helper function approach
-- This is more reliable than inline subqueries

-- 1. Create a helper function to check if user can access a family_id
CREATE OR REPLACE FUNCTION user_has_family_access(_family_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM profiles
        WHERE id = auth.uid()
        AND family_id = _family_id
    );
$$;

-- Grant execute on the helper function
GRANT EXECUTE ON FUNCTION user_has_family_access(uuid) TO authenticated;

-- 2. Ensure RLS is enabled
ALTER TABLE children ENABLE ROW LEVEL SECURITY;

-- 3. Drop all existing policies
DROP POLICY IF EXISTS "Users can view family children" ON children;
DROP POLICY IF EXISTS "Users can update family children" ON children;
DROP POLICY IF EXISTS "Users can insert family children" ON children;
DROP POLICY IF EXISTS "Users can delete family children" ON children;
DROP POLICY IF EXISTS "children_select_policy" ON children;
DROP POLICY IF EXISTS "children_insert_policy" ON children;
DROP POLICY IF EXISTS "children_update_policy" ON children;
DROP POLICY IF EXISTS "children_delete_policy" ON children;

-- 4. Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON children TO authenticated;
GRANT ALL ON children TO service_role;

-- 5. Create policies using the helper function
CREATE POLICY "Users can view family children" ON children
    FOR SELECT
    TO authenticated
    USING (user_has_family_access(family_id));

CREATE POLICY "Users can update family children" ON children
    FOR UPDATE
    TO authenticated
    USING (user_has_family_access(family_id))
    WITH CHECK (user_has_family_access(family_id));

CREATE POLICY "Users can insert family children" ON children
    FOR INSERT
    TO authenticated
    WITH CHECK (user_has_family_access(family_id));

CREATE POLICY "Users can delete family children" ON children
    FOR DELETE
    TO authenticated
    USING (user_has_family_access(family_id));

-- 6. Ensure archived column exists and has proper constraints
DO $$
BEGIN
    -- Add column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'children' 
        AND column_name = 'archived'
    ) THEN
        ALTER TABLE children ADD COLUMN archived boolean DEFAULT false NOT NULL;
        RAISE NOTICE 'Added archived column';
    ELSE
        -- Ensure it has default and is not null
        ALTER TABLE children 
            ALTER COLUMN archived SET DEFAULT false,
            ALTER COLUMN archived SET NOT NULL;
        
        -- Update any NULL values
        UPDATE children SET archived = false WHERE archived IS NULL;
        
        RAISE NOTICE 'Updated archived column';
    END IF;
END $$;

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_children_family_id ON children(family_id);
CREATE INDEX IF NOT EXISTS idx_children_archived ON children(archived) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_children_family_archived ON children(family_id, archived) WHERE archived = false;

-- 8. Verify the setup
DO $$
DECLARE
    policy_count INTEGER;
    rls_enabled BOOLEAN;
BEGIN
    -- Check RLS
    SELECT rowsecurity INTO rls_enabled
    FROM pg_tables
    WHERE tablename = 'children';
    
    -- Count policies
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = 'children';
    
    IF rls_enabled AND policy_count >= 4 THEN
        RAISE NOTICE 'SUCCESS: RLS enabled with % policies', policy_count;
    ELSE
        RAISE WARNING 'ISSUE: RLS=% Policies=%', rls_enabled, policy_count;
    END IF;
END $$;

