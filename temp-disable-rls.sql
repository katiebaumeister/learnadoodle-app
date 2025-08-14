-- Temporarily disable RLS on all calendar tables
-- This will allow the app to work while we fix the policies

-- Disable RLS on all calendar tables
ALTER TABLE IF EXISTS academic_years DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS typical_holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS holidays DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS class_days DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS class_day_mappings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lessons DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attendance DISABLE ROW LEVEL SECURITY;

-- Show the status
SELECT 'RLS DISABLED ON CALENDAR TABLES:' as info;
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('academic_years', 'typical_holidays', 'holidays', 'class_days', 'class_day_mappings', 'lessons', 'attendance')
ORDER BY tablename;

SELECT 'Calendar tables should now be accessible!' as status; 