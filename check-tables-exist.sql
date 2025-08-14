-- Check if Calendar Tables Exist
-- This will tell us if the tables were actually created

SELECT 'CHECKING IF TABLES EXIST:' as info;

-- List all tables in the public schema
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

SELECT 'All tables listed above!' as status; 