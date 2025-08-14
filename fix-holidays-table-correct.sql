-- Fix global_official_holidays table - handle the actual table structure
-- This script will check the real table structure and insert data correctly

-- First, let's see what the current table structure actually looks like
SELECT column_name, data_type, is_nullable, ordinal_position
FROM information_schema.columns 
WHERE table_name = 'global_official_holidays' 
ORDER BY ordinal_position;

-- Check if the table has data
SELECT COUNT(*) as existing_records FROM global_official_holidays;

-- Let's see what columns actually exist and their order
DO $$
DECLARE
    col_count INTEGER;
    has_holiday_name BOOLEAN;
    has_name BOOLEAN;
    has_holiday_date BOOLEAN;
    name_col_name TEXT;
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
    
    -- Check if holiday_date column exists
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'global_official_holidays' AND column_name = 'holiday_date'
    ) INTO has_holiday_date;
    
    -- Determine which column to use for the name
    IF has_holiday_name THEN
        name_col_name := 'holiday_name';
    ELSIF has_name THEN
        name_col_name := 'name';
    ELSE
        name_col_name := 'holiday_name';
    END IF;
    
    RAISE NOTICE 'Table has % columns, holiday_name: %, name: %, holiday_date: %, using: %', 
                 col_count, has_holiday_name, has_name, has_holiday_date, name_col_name;
    
    -- If holiday_name doesn't exist but name does, we'll use name
    -- If neither exists, we'll add holiday_name
    IF NOT has_holiday_name AND NOT has_name THEN
        ALTER TABLE global_official_holidays ADD COLUMN holiday_name TEXT;
        name_col_name := 'holiday_name';
        RAISE NOTICE 'Added holiday_name column';
    END IF;
    
    -- Now insert holidays using the correct column name
    IF name_col_name = 'name' THEN
        -- Insert using 'name' column
        INSERT INTO global_official_holidays (holiday_date, name) VALUES
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
        RAISE NOTICE 'Inserted holidays using name column';
    ELSE
        -- Insert using 'holiday_name' column
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
        RAISE NOTICE 'Inserted holidays using holiday_name column';
    END IF;
    
END $$;

-- Verify the data was inserted correctly
SELECT holiday_date, 
       COALESCE(holiday_name, name) as holiday_name 
FROM global_official_holidays 
ORDER BY holiday_date; 