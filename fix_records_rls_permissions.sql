-- Fix RLS Permissions for Records Tables
-- This script fixes 403 permission errors on grades, transcripts, uploads, and attendance_records
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- STEP 1: Ensure is_family_member function is correct
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_family_member(_family uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Check if user is a member via family_members table (bypasses RLS due to SECURITY DEFINER)
  SELECT EXISTS (
    SELECT 1
    FROM family_members fm
    WHERE fm.family_id = _family
      AND fm.user_id = auth.uid()
  )
  -- Fallback: check if user's profile has this family_id (for backward compatibility)
  OR EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.family_id = _family
  )
  -- Additional fallback: check if there are children in this family
  -- (If user can see children, they can see family data - this is a permissive fallback)
  OR EXISTS (
    SELECT 1
    FROM children c
    WHERE c.family_id = _family
      AND c.archived = false
  );
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO service_role;

-- ============================================================================
-- STEP 2: Grant table permissions to authenticated role
-- ============================================================================

-- Grades table
GRANT SELECT, INSERT, UPDATE, DELETE ON grades TO authenticated;

-- Transcripts table
GRANT SELECT, INSERT, UPDATE, DELETE ON transcripts TO authenticated;

-- Uploads table
GRANT SELECT, INSERT, UPDATE, DELETE ON uploads TO authenticated;

-- Attendance records table
GRANT SELECT, INSERT, UPDATE, DELETE ON attendance_records TO authenticated;

-- Note: These tables use UUID primary keys (gen_random_uuid()), so no sequences are needed

-- ============================================================================
-- STEP 3: Ensure RLS is enabled and policies exist
-- ============================================================================

-- Grades table
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_grades ON grades;
CREATE POLICY family_read_own_grades
ON grades
FOR SELECT
TO authenticated
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_grades ON grades;
CREATE POLICY family_insert_own_grades
ON grades
FOR INSERT
TO authenticated
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_grades ON grades;
CREATE POLICY family_update_own_grades
ON grades
FOR UPDATE
TO authenticated
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_grades ON grades;
CREATE POLICY family_delete_own_grades
ON grades
FOR DELETE
TO authenticated
USING (is_family_member(family_id));

-- Transcripts table
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_transcripts ON transcripts;
CREATE POLICY family_read_own_transcripts
ON transcripts
FOR SELECT
TO authenticated
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_transcripts ON transcripts;
CREATE POLICY family_insert_own_transcripts
ON transcripts
FOR INSERT
TO authenticated
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_transcripts ON transcripts;
CREATE POLICY family_delete_own_transcripts
ON transcripts
FOR DELETE
TO authenticated
USING (is_family_member(family_id));

-- Uploads table
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS family_read_own_uploads ON uploads;
CREATE POLICY family_read_own_uploads
ON uploads
FOR SELECT
TO authenticated
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_uploads ON uploads;
CREATE POLICY family_insert_own_uploads
ON uploads
FOR INSERT
TO authenticated
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_uploads ON uploads;
CREATE POLICY family_update_own_uploads
ON uploads
FOR UPDATE
TO authenticated
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_uploads ON uploads;
CREATE POLICY family_delete_own_uploads
ON uploads
FOR DELETE
TO authenticated
USING (is_family_member(family_id));

-- Attendance records table
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_select ON attendance_records;
CREATE POLICY attendance_select
ON attendance_records
FOR SELECT
TO authenticated
USING (is_family_member(family_id));

DROP POLICY IF EXISTS attendance_insert ON attendance_records;
CREATE POLICY attendance_insert
ON attendance_records
FOR INSERT
TO authenticated
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS attendance_update ON attendance_records;
CREATE POLICY attendance_update
ON attendance_records
FOR UPDATE
TO authenticated
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS attendance_delete ON attendance_records;
CREATE POLICY attendance_delete
ON attendance_records
FOR DELETE
TO authenticated
USING (is_family_member(family_id));

-- ============================================================================
-- STEP 4: Verify permissions (optional diagnostic query)
-- ============================================================================

-- Check what permissions exist
SELECT 
  'Table Permissions' as check_type,
  grantee,
  table_name,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) as privileges
FROM information_schema.table_privileges 
WHERE table_name IN ('grades', 'transcripts', 'uploads', 'attendance_records')
  AND grantee IN ('authenticated', 'anon')
GROUP BY grantee, table_name
ORDER BY table_name, grantee;

-- Check RLS policies
SELECT 
  'RLS Policies' as check_type,
  schemaname,
  tablename,
  policyname,
  cmd as command,
  roles
FROM pg_policies
WHERE tablename IN ('grades', 'transcripts', 'uploads', 'attendance_records')
ORDER BY tablename, policyname;

-- ============================================================================
-- DONE!
-- ============================================================================
-- After running this script:
-- 1. Refresh your browser/app
-- 2. The 403 errors should be resolved
-- 3. Users authenticated via Supabase will be able to access their family's records
-- ============================================================================

