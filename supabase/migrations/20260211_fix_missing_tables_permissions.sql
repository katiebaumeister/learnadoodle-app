-- Fix permissions for newly created tables
-- This migration adds missing GRANT statements and ensures is_family_member function exists

-- Ensure is_family_member function exists (required for RLS policies)
CREATE OR REPLACE FUNCTION public.is_family_member(_family uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM family_members fm
    WHERE fm.family_id = _family
      AND fm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.family_id = _family
  );
$$;

-- Grant permissions to authenticated users (required for RLS to work)
-- These grants allow authenticated users to access tables through RLS policies
GRANT SELECT, INSERT, UPDATE, DELETE ON subject_track TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON grades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON event_outcomes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON family_compliance_checklist TO authenticated;

-- Ensure service_role also has permissions (for backend operations)
GRANT SELECT, INSERT, UPDATE, DELETE ON subject_track TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON grades TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON event_outcomes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON family_compliance_checklist TO service_role;
