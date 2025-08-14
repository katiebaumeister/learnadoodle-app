-- Add Lessons, Attendance, and Holidays Data
-- This script adds data to the tables we want to populate
-- Note: Column names may need adjustment based on actual table structure

-- ========================================
-- LESSONS DATA
-- ========================================
-- Add sample lessons for the first week
-- Note: Replace column names with actual ones from your lessons table

/*
INSERT INTO lessons (
    -- Replace these with actual column names from your lessons table
    id, 
    academic_year_id,  -- or whatever the actual column name is
    subject_name,      -- or whatever the actual column name is
    lesson_number, 
    lesson_date, 
    content_summary, 
    content_details, 
    created_at, 
    updated_at
) VALUES 
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
*/

-- ========================================
-- ATTENDANCE DATA
-- ========================================
-- Add daily attendance for the first week
-- Note: Replace column names with actual ones from your attendance table

/*
INSERT INTO attendance (
    -- Replace these with actual column names from your attendance table
    id, 
    child_id, 
    attendance_date, 
    attended, 
    notes, 
    checked_at
) VALUES 
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
*/

-- ========================================
-- HOLIDAYS DATA
-- ========================================
-- Add major US holidays for the academic year
-- Note: Replace column names with actual ones from your holidays table

/*
INSERT INTO holidays (
    -- Replace these with actual column names from your holidays table
    id, 
    academic_year_id,  -- or whatever the actual column name is
    holiday_name, 
    holiday_date, 
    is_proposed, 
    created_at
) VALUES 
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
*/

-- ========================================
-- INSTRUCTIONS
-- ========================================
SELECT 'INSTRUCTIONS:' as info;
SELECT '1. First run check-all-table-structures.sql to see actual column names' as step;
SELECT '2. Uncomment and modify the INSERT statements above' as step;
SELECT '3. Replace column names with actual ones from your tables' as step;
SELECT '4. Run the modified INSERT statements' as step;
SELECT '5. Verify data was created successfully' as step;
