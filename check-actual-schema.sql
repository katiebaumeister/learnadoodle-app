-- Check the actual structure of children and family tables
-- This will help us understand what columns actually exist

-- Check if tables exist
SELECT 'Table Check:' as info;
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_name IN ('children', 'family', 'families')
AND table_schema = 'public'
ORDER BY table_name;

-- Check children table structure
SELECT 'Children Table Structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'children' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check family table structure
SELECT 'Family Table Structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'family' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check families table structure (if it exists)
SELECT 'Families Table Structure:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'families' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if there are any sample rows
SELECT 'Sample Data Check:' as info;
SELECT 'Children count:' as table_name, COUNT(*) as count FROM children
UNION ALL
SELECT 'Family count:', COUNT(*) FROM family
UNION ALL
SELECT 'Families count:', COUNT(*) FROM families;
