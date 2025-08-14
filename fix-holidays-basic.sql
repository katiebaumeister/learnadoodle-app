-- Basic fix for global_official_holidays table
-- This script only uses columns that definitely exist

-- Show the table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'global_official_holidays' 
ORDER BY ordinal_position;

-- Clear existing data
DELETE FROM global_official_holidays;

-- Insert holidays using only the columns we know exist
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
('2024-12-25', 'Christmas Day');

-- Show the results
SELECT holiday_date, name FROM global_official_holidays ORDER BY holiday_date; 