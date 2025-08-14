-- Basic Diagnostic - Check if tables exist and are accessible

-- 1. Check if we can run basic queries
SELECT 'BASIC QUERY TEST:' as test;
SELECT 1 as test_value;

-- 2. Check if tables exist in information_schema
SELECT 'TABLE EXISTENCE CHECK:' as test;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('academic_years', 'typical_holidays')
ORDER BY table_name;

-- 3. Try to access academic_years directly
SELECT 'ACADEMIC_YEARS ACCESS:' as test;
SELECT COUNT(*) as count FROM academic_years;

-- 4. Try to access typical_holidays directly  
SELECT 'TYPICAL_HOLIDAYS ACCESS:' as test;
SELECT COUNT(*) as count FROM typical_holidays;

-- 5. Check current user
SELECT 'CURRENT USER:' as test;
SELECT current_user;

SELECT 'Basic diagnostic completed!' as status; 