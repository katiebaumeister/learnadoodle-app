-- Fix Lessons Table - Add Missing Columns
-- This script adds the missing columns that the calendar system expects

-- Add missing columns to lessons table
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS lesson_date DATE;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS content_summary TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS content_details TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Show the current lessons table structure
SELECT 'LESSONS TABLE STRUCTURE:' as info;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'lessons' 
ORDER BY ordinal_position;

-- Verify the table has all required columns
SELECT 'VERIFICATION:' as info;
SELECT 
    CASE 
        WHEN COUNT(*) = 8 THEN '✅ Lessons table has all required columns'
        ELSE '❌ Lessons table is missing columns'
    END as status,
    COUNT(*) as column_count
FROM information_schema.columns 
WHERE table_name = 'lessons';

SELECT 'Lessons table fixed successfully!' as status; 