-- Final fix for global_official_holidays table
-- This script handles the case where both 'name' and 'holiday_name' columns exist

-- First, let's see the exact table structure
SELECT column_name, data_type, is_nullable, ordinal_position
FROM information_schema.columns 
WHERE table_name = 'global_official_holidays' 
ORDER BY ordinal_position;

-- Check current data
SELECT * FROM global_official_holidays LIMIT 5;

-- Handle the table with both name and holiday_name columns
DO $$
DECLARE
    has_name BOOLEAN;
    has_holiday_name BOOLEAN;
    name_is_nullable BOOLEAN;
    holiday_name_is_nullable BOOLEAN;
BEGIN
    -- Check if name column exists and its constraints
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'global_official_holidays' AND column_name = 'name'
    ) INTO has_name;
    
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'global_official_holidays' AND column_name = 'holiday_name'
    ) INTO has_holiday_name;
    
    -- Check if name column is nullable
    SELECT is_nullable = 'YES' INTO name_is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'global_official_holidays' AND column_name = 'name';
    
    -- Check if holiday_name column is nullable
    SELECT is_nullable = 'YES' INTO holiday_name_is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'global_official_holidays' AND column_name = 'holiday_name';
    
    RAISE NOTICE 'has_name: %, has_holiday_name: %, name_is_nullable: %, holiday_name_is_nullable: %', 
                 has_name, has_holiday_name, name_is_nullable, holiday_name_is_nullable;
    
    -- If both columns exist and name is NOT NULL, we need to insert into both
    IF has_name AND has_holiday_name AND NOT name_is_nullable THEN
        -- Insert into both columns
        INSERT INTO global_official_holidays (holiday_date, name, holiday_name) VALUES
        ('2024-01-01', 'New Year''s Day', 'New Year''s Day'),
        ('2024-01-15', 'Martin Luther King Jr. Day', 'Martin Luther King Jr. Day'),
        ('2024-02-19', 'Presidents'' Day', 'Presidents'' Day'),
        ('2024-05-27', 'Memorial Day', 'Memorial Day'),
        ('2024-07-04', 'Independence Day', 'Independence Day'),
        ('2024-09-02', 'Labor Day', 'Labor Day'),
        ('2024-10-14', 'Columbus Day', 'Columbus Day'),
        ('2024-11-11', 'Veterans Day', 'Veterans Day'),
        ('2024-11-28', 'Thanksgiving Day', 'Thanksgiving Day'),
        ('2024-12-25', 'Christmas Day', 'Christmas Day')
        ON CONFLICT (holiday_date) DO NOTHING;
        RAISE NOTICE 'Inserted into both name and holiday_name columns';
        
    ELSIF has_name AND NOT has_holiday_name THEN
        -- Only name column exists
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
        RAISE NOTICE 'Inserted into name column only';
        
    ELSIF has_holiday_name AND NOT has_name THEN
        -- Only holiday_name column exists
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
        RAISE NOTICE 'Inserted into holiday_name column only';
        
    ELSE
        -- Fallback: try to add holiday_name column and insert
        IF NOT has_holiday_name THEN
            ALTER TABLE global_official_holidays ADD COLUMN holiday_name TEXT;
        END IF;
        
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
        RAISE NOTICE 'Added holiday_name column and inserted data';
    END IF;
    
END $$;

-- Verify the data was inserted correctly
SELECT holiday_date, 
       COALESCE(name, 'N/A') as name_column,
       COALESCE(holiday_name, 'N/A') as holiday_name_column
FROM global_official_holidays 
ORDER BY holiday_date; 