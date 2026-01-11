-- Fix 403 errors for subject_goals table
-- This ensures authenticated users can access subject_goals for children in their family
-- The error occurs because RLS policies are too restrictive or failing

-- ==========================================================
-- 1. Check current RLS status
-- ==========================================================

-- Verify RLS is enabled
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename = 'subject_goals';

-- Check existing policies
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'subject_goals';

-- ==========================================================
-- 2. Drop existing policies to recreate them
-- ==========================================================

DROP POLICY IF EXISTS "Users can view subject goals for their children" ON subject_goals;
DROP POLICY IF EXISTS "Users can manage subject goals for their children" ON subject_goals;
DROP POLICY IF EXISTS "Authenticated users can view subject goals" ON subject_goals;
DROP POLICY IF EXISTS "Authenticated users can manage subject goals" ON subject_goals;

-- ==========================================================
-- 3. Create more permissive RLS policies
-- ==========================================================

-- Enable RLS
ALTER TABLE subject_goals ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow SELECT for authenticated users whose family contains the child
-- This uses a simpler EXISTS check to avoid RLS recursion issues
CREATE POLICY "Users can view subject goals for their children"
ON subject_goals FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM children c
    WHERE c.id = subject_goals.child_id
      AND c.family_id = (
        SELECT p.family_id
        FROM profiles p
        WHERE p.id = auth.uid()
        LIMIT 1
      )
  )
);

-- Policy 2: Allow INSERT, UPDATE, DELETE for authenticated users
CREATE POLICY "Users can manage subject goals for their children"
ON subject_goals FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM children c
    WHERE c.id = subject_goals.child_id
      AND c.family_id = (
        SELECT p.family_id
        FROM profiles p
        WHERE p.id = auth.uid()
        LIMIT 1
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM children c
    WHERE c.id = subject_goals.child_id
      AND c.family_id = (
        SELECT p.family_id
        FROM profiles p
        WHERE p.id = auth.uid()
        LIMIT 1
      )
  )
);

-- ==========================================================
-- 4. Grant table permissions (backup in case RLS fails)
-- ==========================================================

-- Grant SELECT to authenticated role (RLS will still apply)
GRANT SELECT ON subject_goals TO authenticated;
GRANT INSERT, UPDATE, DELETE ON subject_goals TO authenticated;

-- ==========================================================
-- 5. Verify the fix
-- ==========================================================

-- Check policies were created
SELECT 
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'subject_goals'
ORDER BY policyname;

-- Test query (should work for authenticated users)
-- SELECT COUNT(*) FROM subject_goals WHERE child_id IN (
--   SELECT id FROM children WHERE family_id = (
--     SELECT family_id FROM profiles WHERE id = auth.uid()
--   )
-- );
