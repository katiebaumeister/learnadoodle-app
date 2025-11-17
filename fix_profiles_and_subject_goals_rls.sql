-- Fix RLS policies for profiles and subject_goals tables
-- Ensures users can query their own profile and subject_goals for their children

-- ==========================================================
-- 1. FIX PROFILES TABLE RLS
-- ==========================================================

-- Enable RLS on profiles (was disabled to avoid recursion)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies on profiles
DROP POLICY IF EXISTS "Self can access profile" ON profiles;
DROP POLICY IF EXISTS "Family can access profiles" ON profiles;
DROP POLICY IF EXISTS "profiles_policy" ON profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON profiles;
DROP POLICY IF EXISTS "Enable update for users based on email" ON profiles;
DROP POLICY IF EXISTS "Enable delete for users based on email" ON profiles;
DROP POLICY IF EXISTS "profiles_family_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_self_policy" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can manage their own profile" ON profiles;

-- Simple policy: users can read and manage their own profile
-- This avoids recursion issues and is safe for PostgREST
CREATE POLICY "Users can view their own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can manage their own profile"
ON profiles FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ==========================================================
-- 2. FIX SUBJECT_GOALS TABLE RLS
-- ==========================================================

-- Ensure children table allows RLS checks (but keep existing policies)
-- The policy evaluation will work if children has proper RLS

-- Enable RLS if not already enabled
ALTER TABLE subject_goals ENABLE ROW LEVEL SECURITY;

-- Drop existing policies and function to recreate them
DROP POLICY IF EXISTS "Users can view subject goals for their children" ON subject_goals;
DROP POLICY IF EXISTS "Users can manage subject goals for their children" ON subject_goals;
DROP FUNCTION IF EXISTS user_owns_child(uuid);

-- Try a nested subquery approach - avoid JOIN to reduce RLS complexity
-- Check if child's family_id matches user's profile family_id
CREATE POLICY "Users can view subject goals for their children"
ON subject_goals FOR SELECT
USING (
  child_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM children c
    WHERE c.id = subject_goals.child_id
      AND c.family_id IN (
        SELECT p.family_id
        FROM profiles p
        WHERE p.id = auth.uid()
      )
  )
);

-- Create policy for INSERT, UPDATE, DELETE operations  
CREATE POLICY "Users can manage subject goals for their children"
ON subject_goals FOR ALL
USING (
  child_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM children c
    WHERE c.id = subject_goals.child_id
      AND c.family_id IN (
        SELECT p.family_id
        FROM profiles p
        WHERE p.id = auth.uid()
      )
  )
)
WITH CHECK (
  child_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM children c
    WHERE c.id = subject_goals.child_id
      AND c.family_id IN (
        SELECT p.family_id
        FROM profiles p
        WHERE p.id = auth.uid()
      )
  )
);

-- ==========================================================
-- 3. VERIFY POLICIES
-- ==========================================================

-- Verify profiles policies
SELECT 
  'profiles' as table_name,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'profiles';

-- Verify subject_goals policies
SELECT 
  'subject_goals' as table_name,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'subject_goals';

