-- List columns for each table individually
-- Run these one at a time to see the table structure

-- 1. Check lessons table columns
SELECT 'LESSONS TABLE COLUMNS:' as table_info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'lessons' 
ORDER BY ordinal_position;

-- 2. Check attendance table columns  
SELECT 'ATTENDANCE TABLE COLUMNS:' as table_info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'attendance' 
ORDER BY ordinal_position;

-- 3. Check holidays table columns
SELECT 'HOLIDAYS TABLE COLUMNS:' as table_info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'holidays' 
ORDER BY ordinal_position;
