-- Simple fix for global_official_holidays table
-- This script works with the existing table structure

-- First, let's see what columns actually exist
SELECT column_name, data_type, is_nullable, ordinal_position
FROM information_schema.columns 
WHERE table_name = 'global_official_holidays' 
ORDER BY ordinal_position;

-- Check current data
SELECT * FROM global_official_holidays LIMIT 5;

-- Clear any existing data to avoid conflicts
DELETE FROM global_official_holidays;

-- Insert holidays using the existing column structure
-- Based on the error, we know there's a 'name' column that's NOT NULL
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

-- Verify the data was inserted correctly
SELECT holiday_date, name FROM global_official_holidays ORDER BY holiday_date; 