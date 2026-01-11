-- Fix RLS Permissions for syllabi table
-- Run this in Supabase SQL Editor to allow authenticated users to create syllabi

-- ============================================================================
-- Ensure is_family_member function exists
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
  );
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid) TO service_role;

-- ============================================================================
-- RLS Policies for syllabi table
-- ============================================================================

-- Enable RLS
ALTER TABLE public.syllabi ENABLE ROW LEVEL SECURITY;

-- Select Policy: Users can read syllabi from their family
DROP POLICY IF EXISTS syllabi_select ON public.syllabi;
CREATE POLICY syllabi_select ON public.syllabi
  FOR SELECT
  USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

-- Insert Policy: Users can create syllabi for their family
DROP POLICY IF EXISTS syllabi_insert ON public.syllabi;
CREATE POLICY syllabi_insert ON public.syllabi
  FOR INSERT
  WITH CHECK (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

-- Update Policy: Users can update syllabi from their family
DROP POLICY IF EXISTS syllabi_update ON public.syllabi;
CREATE POLICY syllabi_update ON public.syllabi
  FOR UPDATE
  USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

-- Delete Policy: Users can delete syllabi from their family
DROP POLICY IF EXISTS syllabi_delete ON public.syllabi;
CREATE POLICY syllabi_delete ON public.syllabi
  FOR DELETE
  USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================================================
-- RLS Policies for syllabus_sections table
-- ============================================================================

-- Enable RLS
ALTER TABLE public.syllabus_sections ENABLE ROW LEVEL SECURITY;

-- Select Policy: Users can read sections from syllabi in their family
DROP POLICY IF EXISTS syllabus_sections_select ON public.syllabus_sections;
CREATE POLICY syllabus_sections_select ON public.syllabus_sections
  FOR SELECT
  USING (
    syllabus_id IN (
      SELECT id FROM syllabi 
      WHERE family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Insert Policy: Users can create sections for syllabi in their family
DROP POLICY IF EXISTS syllabus_sections_insert ON public.syllabus_sections;
CREATE POLICY syllabus_sections_insert ON public.syllabus_sections
  FOR INSERT
  WITH CHECK (
    syllabus_id IN (
      SELECT id FROM syllabi 
      WHERE family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Update Policy: Users can update sections for syllabi in their family
DROP POLICY IF EXISTS syllabus_sections_update ON public.syllabus_sections;
CREATE POLICY syllabus_sections_update ON public.syllabus_sections
  FOR UPDATE
  USING (
    syllabus_id IN (
      SELECT id FROM syllabi 
      WHERE family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    syllabus_id IN (
      SELECT id FROM syllabi 
      WHERE family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Delete Policy: Users can delete sections for syllabi in their family
DROP POLICY IF EXISTS syllabus_sections_delete ON public.syllabus_sections;
CREATE POLICY syllabus_sections_delete ON public.syllabus_sections
  FOR DELETE
  USING (
    syllabus_id IN (
      SELECT id FROM syllabi 
      WHERE family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    )
  );

-- ============================================================================
-- Grant table permissions to authenticated role
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.syllabi TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.syllabus_sections TO authenticated;

-- ============================================================================
-- Verify policies were created
-- ============================================================================

SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename IN ('syllabi', 'syllabus_sections')
ORDER BY tablename, policyname;
