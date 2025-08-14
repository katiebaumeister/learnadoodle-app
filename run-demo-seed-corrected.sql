-- Corrected Demo Seed Data for Max and Lilly
-- This version matches your actual table structure:
-- - family table (not families)
-- - children.name (not first_name/last_name)
-- - children.grade (not grade_level)
-- - No notes column in children table

-- First, ensure we have a family setup
INSERT INTO family (id, name, created_at, updated_at) 
VALUES 
    ('550e8400-e29b-41d4-a716-446655440001', 'Baumeister Family', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Create Max and Lilly as children
INSERT INTO children (id, family_id, name, grade, created_at, updated_at)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'Max', '4th Grade', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001', 'Lilly', '2nd Grade', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Create academic year 2024-2025
INSERT INTO academic_years (id, family_id, year_name, start_date, end_date, total_days, total_hours, hours_per_day, is_current, created_at, updated_at)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440001', '2024-2025 School Year', '2024-08-26', '2025-06-06', 180, 1080, 6.0, true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Set up teaching days (Monday-Friday)
INSERT INTO class_days (id, academic_year_id, day_of_week, created_at)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440004', 1, NOW()), -- Monday
    ('550e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440004', 2, NOW()), -- Tuesday
    ('550e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440004', 3, NOW()), -- Wednesday
    ('550e8400-e29b-41d4-a716-446655440008', '550e8400-e29b-41d4-a716-446655440004', 4, NOW()), -- Thursday
    ('550e8400-e29b-41d4-a716-446655440009', '550e8400-e29b-41d4-a716-446655440004', 5, NOW())  -- Friday
ON CONFLICT DO NOTHING;

-- Create subjects for Max and Lilly
INSERT INTO subject (id, family_id, children_id, name, grade, notes, created_at, updated_at)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', 'Mathematics', '4th Grade', 'Focus on fractions, decimals, and problem solving', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', 'Science', '4th Grade', 'Earth science and simple experiments', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440012', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', 'Language Arts', '4th Grade', 'Reading comprehension and writing', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440013', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440003', 'Mathematics', '2nd Grade', 'Addition, subtraction, and place value', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440014', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440003', 'Reading', '2nd Grade', 'Phonics and early reading skills', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440015', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440003', 'Art', '2nd Grade', 'Creative expression and basic techniques', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Create sample lessons for the first few weeks
INSERT INTO lessons (id, academic_year_id, subject_name, lesson_number, lesson_date, content_summary, content_details, created_at, updated_at)
VALUES 
    -- Max's Math lessons
    ('550e8400-e29b-41d4-a716-446655440020', '550e8400-e29b-41d4-a716-446655440004', 'Mathematics', 1, '2024-08-26', 'Introduction to Fractions', 'Understanding what fractions represent, basic fraction notation', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440021', '550e8400-e29b-41d4-a716-446655440004', 'Mathematics', 2, '2024-08-27', 'Fraction Models', 'Using visual models to represent fractions', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440022', '550e8400-e29b-41d4-a716-446655440004', 'Mathematics', 3, '2024-08-28', 'Comparing Fractions', 'Using number lines and models to compare fractions', NOW(), NOW()),
    
    -- Max's Science lessons
    ('550e8400-e29b-41d4-a716-446655440023', '550e8400-e29b-41d4-a716-446655440004', 'Science', 1, '2024-08-29', 'Earth''s Layers', 'Introduction to the structure of Earth', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440024', '550e8400-e29b-41d4-a716-446655440004', 'Science', 2, '2024-08-30', 'Rocks and Minerals', 'Identifying different types of rocks', NOW(), NOW()),
    
    -- Lilly's Math lessons
    ('550e8400-e29b-41d4-a716-446655440025', '550e8400-e29b-41d4-a716-446655440004', 'Mathematics', 1, '2024-08-26', 'Addition Review', 'Two-digit addition with regrouping', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440026', '550e8400-e29b-41d4-a716-446655440004', 'Mathematics', 2, '2024-08-27', 'Subtraction Practice', 'Two-digit subtraction with borrowing', NOW(), NOW()),
    
    -- Lilly's Reading lessons
    ('550e8400-e29b-41d4-a716-446655440027', '550e8400-e29b-41d4-a716-446655440004', 'Reading', 1, '2024-08-28', 'Phonics Review', 'Consonant blends and digraphs', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440028', '550e8400-e29b-41d4-a716-446655440004', 'Reading', 2, '2024-08-29', 'Reading Comprehension', 'Understanding story elements', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Create attendance records for the first week
INSERT INTO attendance (id, child_id, attendance_date, attended, notes, checked_at)
VALUES 
    -- Max's attendance
    ('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440002', '2024-08-26', true, 'Great participation in math', NOW()),
    ('550e8400-e29b-41d4-a716-446655440031', '550e8400-e29b-41d4-a716-446655440002', '2024-08-27', true, 'Excited about fractions', NOW()),
    ('550e8400-e29b-41d4-a716-446655440032', '550e8400-e29b-41d4-a716-446655440002', '2024-08-28', true, 'Math lesson completed', NOW()),
    ('550e8400-e29b-41d4-a716-446655440033', '550e8400-e29b-41d4-a716-446655440002', '2024-08-29', true, 'Science experiment day', NOW()),
    ('550e8400-e29b-41d4-a716-446655440034', '550e8400-e29b-41d4-a716-446655440002', '2024-08-30', true, 'Rocks and minerals lesson', NOW()),
    
    -- Lilly's attendance
    ('550e8400-e29b-41d4-a716-446655440035', '550e8400-e29b-41d4-a716-446655440003', '2024-08-26', true, 'Math addition practice', NOW()),
    ('550e8400-e29b-41d4-a716-446655440036', '550e8400-e29b-41d4-a716-446655440003', '2024-08-27', true, 'Subtraction with borrowing', NOW()),
    ('550e8400-e29b-41d4-a716-446655440037', '550e8400-e29b-41d4-a716-446655440003', '2024-08-28', true, 'Phonics review session', NOW()),
    ('550e8400-e29b-41d4-a716-446655440038', '550e8400-e29b-41d4-a716-446655440003', '2024-08-29', true, 'Reading comprehension', NOW()),
    ('550e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440003', '2024-08-30', false, 'Family appointment', NOW())
ON CONFLICT DO NOTHING;

-- Create some holidays for the academic year
INSERT INTO holidays (id, academic_year_id, holiday_name, holiday_date, is_proposed, created_at)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440004', 'Labor Day', '2024-09-02', false, NOW()),
    ('550e8400-e29b-41d4-a716-446655440042', '550e8400-e29b-41d4-a716-446655440004', 'Columbus Day', '2024-10-14', false, NOW()),
    ('550e8400-e29b-41d4-a716-446655440043', '550e8400-e29b-41d4-a716-446655440004', 'Veterans Day', '2024-11-11', false, NOW()),
    ('550e8400-e29b-41d4-a716-446655440044', '550e8400-e29b-41d4-a716-446655440004', 'Thanksgiving Break', '2024-11-28', false, NOW()),
    ('550e8400-e29b-41d4-a716-446655440045', '550e8400-e29b-41d4-a716-446655440004', 'Christmas Break', '2024-12-25', false, NOW()),
    ('550e8400-e29b-41d4-a716-446655440046', '550e8400-e29b-41d4-a716-446655440004', 'New Year''s Day', '2025-01-01', false, NOW()),
    ('550e8400-e29b-41d4-a716-446655440047', '550e8400-e29b-41d4-a716-446655440004', 'Martin Luther King Jr. Day', '2025-01-20', false, NOW()),
    ('550e8400-e29b-41d4-a716-446655440048', '550e8400-e29b-41d4-a716-446655440004', 'Presidents'' Day', '2025-02-17', false, NOW()),
    ('550e8400-e29b-41d4-a716-446655440049', '550e8400-e29b-41d4-a716-446655440004', 'Memorial Day', '2025-05-26', false, NOW())
ON CONFLICT DO NOTHING;

-- Create class day mappings for the first few weeks
INSERT INTO class_day_mappings (id, academic_year_id, class_date, class_day_number, is_vacation, created_at)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440050', '550e8400-e29b-41d4-a716-446655440004', '2024-08-26', 1, false, NOW()), -- Monday
    ('550e8400-e29b-41d4-a716-446655440051', '550e8400-e29b-41d4-a716-446655440004', '2024-08-27', 2, false, NOW()), -- Tuesday
    ('550e8400-e29b-41d4-a716-446655440052', '550e8400-e29b-41d4-a716-446655440004', '2024-08-28', 3, false, NOW()), -- Wednesday
    ('550e8400-e29b-41d4-a716-446655440053', '550e8400-e29b-41d4-a716-446655440004', '2024-08-29', 4, false, NOW()), -- Thursday
    ('550e8400-e29b-41d4-a716-446655440054', '550e8400-e29b-41d4-a716-446655440004', '2024-08-30', 5, false, NOW()), -- Friday
    ('550e8400-e29b-41d4-a716-446655440055', '550e8400-e29b-41d4-a716-446655440004', '2024-09-02', NULL, true, NOW()), -- Labor Day
    ('550e8400-e29b-41d4-a716-446655440056', '550e8400-e29b-41d4-a716-446655440004', '2024-09-03', 6, false, NOW()), -- Tuesday after holiday
    ('550e8400-e29b-41d4-a716-446655440057', '550e8400-e29b-41d4-a716-446655440004', '2024-09-04', 7, false, NOW()), -- Wednesday
    ('550e8400-e29b-41d4-a716-446655440058', '550e8400-e29b-41d4-a716-446655440004', '2024-09-05', 8, false, NOW()), -- Thursday
    ('550e8400-e29b-41d4-a716-446655440059', '550e8400-e29b-41d4-a716-446655440004', '2024-09-06', 9, false, NOW())  -- Friday
ON CONFLICT DO NOTHING;

-- Verify the data was created
SELECT 'Demo Data Summary:' as info;
SELECT 'Family:' as category, COUNT(*) as count FROM family
UNION ALL
SELECT 'Children:', COUNT(*) FROM children
UNION ALL
SELECT 'Academic Years:', COUNT(*) FROM academic_years
UNION ALL
SELECT 'Subjects:', COUNT(*) FROM subject
UNION ALL
SELECT 'Lessons:', COUNT(*) FROM lessons
UNION ALL
SELECT 'Attendance Records:', COUNT(*) FROM attendance
UNION ALL
SELECT 'Holidays:', COUNT(*) FROM holidays
UNION ALL
SELECT 'Class Day Mappings:', COUNT(*) FROM class_day_mappings;

SELECT 'Max and Lilly Demo Data Created Successfully!' as status;
