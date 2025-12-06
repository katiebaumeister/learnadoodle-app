-- Fix RLS Policies for family_compliance_checklist
-- Uses simpler is_family_member helper function pattern
-- Note: is_family_member function should already exist from phase6 migration
-- This script updates the policies to use it

-- Drop existing policies
DROP POLICY IF EXISTS "Family members can view compliance checklist" ON family_compliance_checklist;
DROP POLICY IF EXISTS "Parents can manage compliance checklist" ON family_compliance_checklist;

-- Create simpler SELECT policy using is_family_member helper
-- Note: is_family_member takes family_id as parameter
CREATE POLICY "Family members can view compliance checklist" 
ON family_compliance_checklist
FOR SELECT
TO authenticated
USING (is_family_member(family_id));

-- Create INSERT policy
CREATE POLICY "Family members can insert compliance checklist" 
ON family_compliance_checklist
FOR INSERT
TO authenticated
WITH CHECK (is_family_member(family_id));

-- Create UPDATE policy (parents/admins only)
CREATE POLICY "Family members can update compliance checklist" 
ON family_compliance_checklist
FOR UPDATE
TO authenticated
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

-- Create DELETE policy (parents/admins only)
CREATE POLICY "Family members can delete compliance checklist" 
ON family_compliance_checklist
FOR DELETE
TO authenticated
USING (is_family_member(family_id));

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON family_compliance_checklist TO authenticated;

-- Also ensure service_role can access (for backend API)
GRANT SELECT, INSERT, UPDATE, DELETE ON family_compliance_checklist TO service_role;

COMMENT ON POLICY "Family members can view compliance checklist" ON family_compliance_checklist IS 
'Allows authenticated family members to view compliance checklist items for their family';

COMMENT ON POLICY "Family members can insert compliance checklist" ON family_compliance_checklist IS 
'Allows authenticated family members to create compliance checklist items for their family';

COMMENT ON POLICY "Family members can update compliance checklist" ON family_compliance_checklist IS 
'Allows authenticated family members to update compliance checklist items for their family';

COMMENT ON POLICY "Family members can delete compliance checklist" ON family_compliance_checklist IS 
'Allows authenticated family members to delete compliance checklist items for their family';

