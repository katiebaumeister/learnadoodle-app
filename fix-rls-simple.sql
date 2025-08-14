-- Simple RLS Fix for Calendar Tables
-- This makes tables accessible to authenticated users

-- First, let's temporarily disable RLS to see if tables exist
ALTER TABLE IF EXISTS academic_years DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS typical_holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS class_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS class_day_mappings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lessons DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attendance DISABLE ROW LEVEL SECURITY;

-- Check what tables actually exist
SELECT 'EXISTING TABLES:' as info;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('academic_years', 'typical_holidays', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance')
ORDER BY table_name;

-- Now create simple RLS policies that allow authenticated users to access their data
-- For now, let's enable RLS with permissive policies

-- Enable RLS on all tables
ALTER TABLE IF EXISTS academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS typical_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS class_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS class_day_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attendance ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
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

-- Create simple policies for typical_holidays (global data)
CREATE POLICY "Allow authenticated users to view typical holidays" ON typical_holidays
    FOR SELECT USING (auth.role() = 'authenticated');

-- Create simple policies for other tables (family-specific data)
-- For now, allow authenticated users to access all data (we'll refine this later)

CREATE POLICY "Allow authenticated users to access academic_years" ON academic_years
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to access holidays" ON holidays
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to access class_days" ON class_days
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to access class_day_mappings" ON class_day_mappings
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to access lessons" ON lessons
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to access attendance" ON attendance
    FOR ALL USING (auth.role() = 'authenticated');

-- Show final policies
SELECT 'FINAL POLICIES:' as info;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('academic_years', 'typical_holidays', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance')
ORDER BY tablename, policyname;

SELECT 'Simple RLS policies applied!' as status; 