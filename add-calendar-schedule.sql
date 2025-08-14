-- Add Calendar Schedule Data
-- This populates class_days and class_day_mappings for a proper school schedule

-- ========================================
-- CLASS_DAYS DATA
-- ========================================
-- Set up the basic teaching days (Monday-Friday)
-- Note: Column names may need adjustment based on actual table structure

INSERT INTO class_days (
    id, 
    academic_year_id,
    day_of_week,
    created_at
) VALUES 
    ('550e8400-e29b-41d4-a716-446655440060', '550e8400-e29b-41d4-a716-446655440004', 1, NOW()), -- Monday
    ('550e8400-e29b-41d4-a716-446655440061', '550e8400-e29b-41d4-a716-446655440004', 2, NOW()), -- Tuesday
    ('550e8400-e29b-41d4-a716-446655440062', '550e8400-e29b-41d4-a716-446655440004', 3, NOW()), -- Wednesday
    ('550e8400-e29b-41d4-a716-446655440063', '550e8400-e29b-41d4-a716-446655440004', 4, NOW()), -- Thursday
    ('550e8400-e29b-41d4-a716-446655440064', '550e8400-e29b-41d4-a716-446655440004', 5, NOW())  -- Friday
ON CONFLICT DO NOTHING;

-- ========================================
-- CLASS_DAY_MAPPINGS DATA
-- ========================================
-- Map specific dates to class day numbers for the first few weeks
-- This shows the progression: Aug 26 = Day 1, Aug 27 = Day 2, etc.

INSERT INTO class_day_mappings (
    id, 
    academic_year_id,
    class_date,
    class_day_number,
    is_vacation,
    created_at
) VALUES 
    -- Week 1: August 26-30, 2024
    ('550e8400-e29b-41d4-a716-446655440070', '550e8400-e29b-41d4-a716-446655440004', '2024-08-26', 1, false, NOW()), -- Monday - Day 1
    ('550e8400-e29b-41d4-a716-446655440071', '550e8400-e29b-41d4-a716-446655440004', '2024-08-27', 2, false, NOW()), -- Tuesday - Day 2
    ('550e8400-e29b-41d4-a716-446655440072', '550e8400-e29b-41d4-a716-446655440004', '2024-08-28', 3, false, NOW()), -- Wednesday - Day 3
    ('550e8400-e29b-41d4-a716-446655440073', '550e8400-e29b-41d4-a716-446655440004', '2024-08-29', 4, false, NOW()), -- Thursday - Day 4
    ('550e8400-e29b-41d4-a716-446655440074', '550e8400-e29b-41d4-a716-446655440004', '2024-08-30', 5, false, NOW()), -- Friday - Day 5
    
    -- Week 2: September 2-6, 2024 (Labor Day week)
    ('550e8400-e29b-41d4-a716-446655440075', '550e8400-e29b-41d4-a716-446655440004', '2024-09-02', NULL, true, NOW()), -- Monday - Labor Day (vacation)
    ('550e8400-e29b-41d4-a716-446655440076', '550e8400-e29b-41d4-a716-446655440004', '2024-09-03', 6, false, NOW()), -- Tuesday - Day 6
    ('550e8400-e29b-41d4-a716-446655440077', '550e8400-e29b-41d4-a716-446655440004', '2024-09-04', 7, false, NOW()), -- Wednesday - Day 7
    ('550e8400-e29b-41d4-a716-446655440078', '550e8400-e29b-41d4-a716-446655440004', '2024-09-05', 8, false, NOW()), -- Thursday - Day 8
    ('550e8400-e29b-41d4-a716-446655440079', '550e8400-e29b-41d4-a716-446655440004', '2024-09-06', 9, false, NOW()), -- Friday - Day 9
    
    -- Week 3: September 9-13, 2024
    ('550e8400-e29b-41d4-a716-446655440080', '550e8400-e29b-41d4-a716-446655440004', '2024-09-09', 10, false, NOW()), -- Monday - Day 10
    ('550e8400-e29b-41d4-a716-446655440081', '550e8400-e29b-41d4-a716-446655440004', '2024-09-10', 11, false, NOW()), -- Tuesday - Day 11
    ('550e8400-e29b-41d4-a716-446655440082', '550e8400-e29b-41d4-a716-446655440004', '2024-09-11', 12, false, NOW()), -- Wednesday - Day 12
    ('550e8400-e29b-41d4-a716-446655440083', '550e8400-e29b-41d4-a716-446655440004', '2024-09-12', 13, false, NOW()), -- Thursday - Day 13
    ('550e8400-e29b-41d4-a716-446655440084', '550e8400-e29b-41d4-a716-446655440004', '2024-09-13', 14, false, NOW())  -- Friday - Day 14
ON CONFLICT DO NOTHING;

-- ========================================
-- VERIFICATION
-- ========================================
SELECT 'Calendar Schedule Added Successfully!' as status;
SELECT 'Class days set up:' as info, COUNT(*) as count FROM class_days WHERE academic_year_id = '550e8400-e29b-41d4-a716-446655440004'
UNION ALL
SELECT 'Class day mappings:', COUNT(*) FROM class_day_mappings WHERE academic_year_id = '550e8400-e29b-41d4-a716-446655440004';

SELECT 'Schedule Summary:' as info;
SELECT 'Week 1 (Aug 26-30):' as week, 'Days 1-5' as days, 'Full week of school' as notes
UNION ALL
SELECT 'Week 2 (Sep 2-6):', 'Days 6-9', 'Labor Day Monday off, 4 school days'
UNION ALL
SELECT 'Week 3 (Sep 9-13):', 'Days 10-14', 'Full week of school';
