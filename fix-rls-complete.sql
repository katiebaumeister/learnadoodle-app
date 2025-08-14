-- Complete RLS Fix for Calendar Tables
-- This makes tables accessible to authenticated users with proper security

-- First, let's check what policies currently exist
SELECT 'CURRENT POLICIES:' as info;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('academic_years', 'typical_holidays', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance')
ORDER BY tablename, policyname;

-- Drop all existing policies on calendar tables
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE tablename IN ('academic_years', 'typical_holidays', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON ' || policy_record.schemaname || '.' || policy_record.tablename;
    END LOOP;
END $$;

-- Enable RLS on all tables
ALTER TABLE IF EXISTS academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS typical_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS class_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS class_day_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attendance ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for authenticated users
-- This allows any authenticated user to access the data (we'll refine this later)

-- typical_holidays (global data - readable by all authenticated users)
CREATE POLICY "Allow authenticated users to view typical holidays" ON typical_holidays
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow service role to manage typical holidays" ON typical_holidays
    FOR ALL USING (auth.role() = 'service_role');

-- academic_years (family-specific data)
CREATE POLICY "Allow authenticated users to access academic_years" ON academic_years
    FOR ALL USING (auth.role() = 'authenticated');

-- holidays (family-specific data)
CREATE POLICY "Allow authenticated users to access holidays" ON holidays
    FOR ALL USING (auth.role() = 'authenticated');

-- class_days (family-specific data)
CREATE POLICY "Allow authenticated users to access class_days" ON class_days
    FOR ALL USING (auth.role() = 'authenticated');

-- class_day_mappings (family-specific data)
CREATE POLICY "Allow authenticated users to access class_day_mappings" ON class_day_mappings
    FOR ALL USING (auth.role() = 'authenticated');

-- lessons (family-specific data)
CREATE POLICY "Allow authenticated users to access lessons" ON lessons
    FOR ALL USING (auth.role() = 'authenticated');

-- attendance (family-specific data)
CREATE POLICY "Allow authenticated users to access attendance" ON attendance
    FOR ALL USING (auth.role() = 'authenticated');

-- Show the final policies
SELECT 'FINAL POLICIES:' as info;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('academic_years', 'typical_holidays', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance')
ORDER BY tablename, policyname;

SELECT 'Complete RLS policies applied!' as status; 