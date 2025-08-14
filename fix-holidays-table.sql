-- Fix global_official_holidays table structure
-- This script will check the current table structure and fix it

-- First, let's see what the current table structure looks like
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'global_official_holidays' 
ORDER BY ordinal_position;

-- Check if the table has data
SELECT COUNT(*) as existing_records FROM global_official_holidays;

-- Let's see what columns actually exist
DO $$
DECLARE
    col_count INTEGER;
    has_holiday_name BOOLEAN;
    has_name BOOLEAN;
BEGIN
    -- Count total columns
    SELECT COUNT(*) INTO col_count 
    FROM information_schema.columns 
    WHERE table_name = 'global_official_holidays';
    
    -- Check if holiday_name column exists
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'global_official_holidays' AND column_name = 'holiday_name'
    ) INTO has_holiday_name;
    
    -- Check if name column exists
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'global_official_holidays' AND column_name = 'name'
    ) INTO has_name;
    
    RAISE NOTICE 'Table has % columns, holiday_name: %, name: %', col_count, has_holiday_name, has_name;
    
    -- If holiday_name doesn't exist, add it
    IF NOT has_holiday_name THEN
        ALTER TABLE global_official_holidays ADD COLUMN holiday_name TEXT;
        RAISE NOTICE 'Added holiday_name column';
    END IF;
    
    -- If name column exists and holiday_name is empty, copy data
    IF has_name AND has_holiday_name THEN
        UPDATE global_official_holidays 
        SET holiday_name = name 
        WHERE holiday_name IS NULL;
        RAISE NOTICE 'Copied name to holiday_name';
    END IF;
    
END $$;

-- Now insert holidays safely
INSERT INTO global_official_holidays (holiday_date, holiday_name) VALUES
('2024-01-01', 'New Year''s Day'),
('2024-01-15', 'Martin Luther King Jr. Day'),
('2024-02-19', 'Presidents'' Day'),
('2024-05-27', 'Memorial Day'),
('2024-07-04', 'Independence Day'),
('2024-09-02', 'Labor Day'),
('2024-10-14', 'Columbus Day'),
('2024-11-11', 'Veterans Day'),
('2024-11-28', 'Thanksgiving Day'),
('2024-12-25', 'Christmas Day')
ON CONFLICT (holiday_date) DO NOTHING;

-- Verify the data
SELECT holiday_date, holiday_name FROM global_official_holidays ORDER BY holiday_date; 