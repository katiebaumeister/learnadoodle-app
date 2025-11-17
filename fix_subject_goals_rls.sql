-- Fix RLS policies for subject_goals table
-- Ensures users can query subject_goals for any child in their family
-- Uses the same pattern as other child-related policies in the codebase

-- Enable RLS if not already enabled
ALTER TABLE subject_goals ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view subject goals for their children" ON subject_goals;
DROP POLICY IF EXISTS "Users can manage subject goals for their children" ON subject_goals;

-- Create SELECT policy using IN subquery pattern (same as children policies)
-- This pattern works even if profiles RLS is disabled
CREATE POLICY "Users can view subject goals for their children"
ON subject_goals FOR SELECT
USING (
  child_id IN (
    SELECT c.id 
    FROM children c 
    JOIN profiles p ON c.family_id = p.family_id 
    WHERE p.id = auth.uid()
  )
);

-- Create policy for INSERT, UPDATE, DELETE operations
CREATE POLICY "Users can manage subject goals for their children"
ON subject_goals FOR ALL
USING (
  child_id IN (
    SELECT c.id 
    FROM children c 
    JOIN profiles p ON c.family_id = p.family_id 
    WHERE p.id = auth.uid()
  )
)
WITH CHECK (
  child_id IN (
    SELECT c.id 
    FROM children c 
    JOIN profiles p ON c.family_id = p.family_id 
    WHERE p.id = auth.uid()
  )
);

-- Verify the policy was created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'subject_goals';

