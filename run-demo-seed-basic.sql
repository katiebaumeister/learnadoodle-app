-- Basic Demo Seed Data for Max and Lilly
-- This version uses your existing family ID: 86ba8b4b-e138-4af3-949d-ac2e1d3a00c9

-- Create Max and Lilly as children with all required fields
INSERT INTO children (
    id, 
    name, 
    age, 
    created_at, 
    updated_at, 
    family_id, 
    grade, 
    avatar,
    learning_style,
    interests,
    standards,
    college_bound
) VALUES 
    ('550e8400-e29b-41d4-a716-446655440002', 'Max', 9, NOW(), NOW(), '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '4th Grade', 'prof1', 'Visual', 'Science, Math, Building', 'Common Core 4th Grade', false),
    ('550e8400-e29b-41d4-a716-446655440003', 'Lilly', 7, NOW(), NOW(), '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '2nd Grade', 'prof2', 'Kinesthetic', 'Reading, Art, Music', 'Common Core 2nd Grade', false)
ON CONFLICT DO NOTHING;

-- Create academic year 2024-2025
INSERT INTO academic_years (id, family_id, year_name, start_date, end_date, total_days, total_hours, hours_per_day, is_current, created_at, updated_at)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440004', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '2024-2025 School Year', '2024-08-26', '2025-06-06', 180, 1080, 6.0, true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Create subjects for Max and Lilly
INSERT INTO subject (id, family_id, children_id, name, grade, notes, created_at, updated_at)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440010', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '550e8400-e29b-41d4-a716-446655440002', 'Mathematics', '4th Grade', 'Focus on fractions, decimals, and problem solving', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440011', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '550e8400-e29b-41d4-a716-446655440002', 'Science', '4th Grade', 'Earth science and simple experiments', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440012', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '550e8400-e29b-41d4-a716-446655440002', 'Language Arts', '4th Grade', 'Reading comprehension and writing', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440013', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '550e8400-e29b-41d4-a716-446655440003', 'Mathematics', '2nd Grade', 'Addition, subtraction, and place value', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440014', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '550e8400-e29b-41d4-a716-446655440003', 'Reading', '2nd Grade', 'Phonics and early reading skills', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440015', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '550e8400-e29b-41d4-a716-446655440003', 'Art', '2nd Grade', 'Creative expression and basic techniques', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Verify the basic data was created
SELECT 'Basic Demo Data Summary:' as info;
SELECT 'Children:' as category, COUNT(*) as count FROM children WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
UNION ALL
SELECT 'Academic Years:', COUNT(*) FROM academic_years WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
UNION ALL
SELECT 'Subjects:', COUNT(*) FROM subject WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

SELECT 'Max and Lilly Basic Demo Data Created Successfully!' as status;
SELECT 'Using existing family ID: 86ba8b4b-e138-4af3-949d-ac2e1d3a00c9' as info;
SELECT 'This gives you the foundation to demo:' as feature;
SELECT '1. Family and children management' as feature;
SELECT '2. Academic year setup' as feature;
SELECT '3. Subject curriculum planning' as feature;
SELECT '4. Basic user interface functionality' as feature;
