-- Fix RLS policies for children table
-- Ensures authenticated users can query children in their family
-- Handles archived column properly

-- Ensure RLS is enabled
ALTER TABLE children ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to recreate them)
DROP POLICY IF EXISTS "Users can view family children" ON children;
DROP POLICY IF EXISTS "Users can update family children" ON children;
DROP POLICY IF EXISTS "Users can insert family children" ON children;
DROP POLICY IF EXISTS "Users can delete family children" ON children;

-- Grant table permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON children TO authenticated;

-- Create SELECT policy - users can view children in their family
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

-- Create UPDATE policy - users can update children in their family
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

-- Create INSERT policy - users can insert children into their family
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

-- Create DELETE policy - users can delete children from their family
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

-- Also grant permissions to service_role for backend operations
GRANT ALL ON children TO service_role;

-- Create index on family_id if it doesn't exist (for performance)
CREATE INDEX IF NOT EXISTS idx_children_family_id ON children(family_id);

-- Create index on archived if it doesn't exist (for performance)
CREATE INDEX IF NOT EXISTS idx_children_archived ON children(archived) WHERE archived = false;

-- Ensure archived column has a default value if NULL
ALTER TABLE children 
    ALTER COLUMN archived SET DEFAULT false;

-- Update any NULL archived values to false
UPDATE children 
SET archived = false 
WHERE archived IS NULL;

