-- Fix Final Permission Issues
-- This script addresses the remaining 403 errors

-- 1. Fix typical_holidays table - it should be publicly readable
-- typical_holidays is global data that all users should be able to read
ALTER TABLE typical_holidays DISABLE ROW LEVEL SECURITY;

-- 2. Ensure academic_years has proper RLS policies
-- Drop any existing policies that might be conflicting
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE tablename = 'academic_years'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON ' || policy_record.schemaname || '.' || policy_record.tablename;
    END LOOP;
END $$;

-- 3. Create simple, permissive policies for academic_years
CREATE POLICY "academic_years_select_policy" ON academic_years
    FOR SELECT USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "academic_years_insert_policy" ON academic_years
    FOR INSERT WITH CHECK (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "academic_years_update_policy" ON academic_years
    FOR UPDATE USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "academic_years_delete_policy" ON academic_years
    FOR DELETE USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

-- 4. Ensure RLS is enabled on academic_years
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;

-- 5. Test the permissions
SELECT 'TESTING PERMISSIONS:' as info;

-- Test typical_holidays access
SELECT 'typical_holidays RLS status:' as table_name, 
       CASE WHEN relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as rls_status
FROM pg_class WHERE relname = 'typical_holidays';

-- Test academic_years policies
SELECT 'academic_years policies:' as info;
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'academic_years'
ORDER BY policyname;

SELECT 'Permission fixes completed!' as status; 