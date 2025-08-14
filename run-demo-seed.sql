-- Run Demo Seed Data for Max and Lilly
-- This script executes the seed data and adds progress tracking

-- First, run the main seed data
\i seed-max-lilly-demo-data.sql

-- Now add some additional progress tracking data for analytics

-- Create learning progress records for Max
INSERT INTO learning_progress (id, child_id, subject_name, lesson_date, progress_percentage, notes, created_at, updated_at)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440060', '550e8400-e29b-41d4-a716-446655440002', 'Mathematics', '2024-08-26', 85, 'Good understanding of basic fractions, needs practice with visual models', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440061', '550e8400-e29b-41d4-a716-446655440002', 'Mathematics', '2024-08-27', 90, 'Excellent work with fraction models, ready for next concept', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440062', '550e8400-e29b-41d4-a716-446655440002', 'Mathematics', '2024-08-28', 88, 'Good progress comparing fractions, some confusion with mixed numbers', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440063', '550e8400-e29b-41d4-a716-446655440002', 'Science', '2024-08-29', 95, 'Very engaged with Earth layers, great questions asked', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440064', '550e8400-e29b-41d4-a716-446655440002', 'Science', '2024-08-30', 92, 'Excellent rock identification, loves hands-on activities', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440065', '550e8400-e29b-41d4-a716-446655440002', 'Language Arts', '2024-08-31', 78, 'Reading comprehension good, writing needs more structure', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Create learning progress records for Lilly
INSERT INTO learning_progress (id, child_id, subject_name, lesson_date, progress_percentage, notes, created_at, updated_at)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440066', '550e8400-e29b-41d4-a716-446655440003', 'Mathematics', '2024-08-26', 92, 'Addition with regrouping mastered, very confident', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440067', '550e8400-e29b-41d4-a716-446655440003', 'Mathematics', '2024-08-27', 88, 'Subtraction with borrowing challenging but improving', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440068', '550e8400-e29b-41d4-a716-446655440003', 'Reading', '2024-08-28', 95, 'Phonics excellent, reading fluency improving', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440069', '550e8400-e29b-41d4-a716-446655440003', 'Reading', '2024-08-29', 90, 'Good comprehension, needs help with inference', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440070', '550e8400-e29b-41d4-a716-446655440003', 'Art', '2024-08-30', 85, 'Creative expression strong, technique improving', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Create learning activities for tracking daily work
INSERT INTO learning_activities (id, child_id, subject_name, activity_date, activity_type, duration_minutes, description, completed, created_at, updated_at)
VALUES 
    -- Max's activities
    ('550e8400-e29b-41d4-a716-446655440071', '550e8400-e29b-41d4-a716-446655440002', 'Mathematics', '2024-08-26', 'Lesson', 45, 'Fractions introduction with manipulatives', true, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440072', '550e8400-e29b-41d4-a716-446655440002', 'Mathematics', '2024-08-26', 'Practice', 30, 'Fraction worksheet completion', true, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440073', '550e8400-e29b-41d4-a716-446655440002', 'Mathematics', '2024-08-27', 'Lesson', 45, 'Fraction models and visualization', true, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440074', '550e8400-e29b-41d4-a716-446655440002', 'Mathematics', '2024-08-27', 'Practice', 25, 'Drawing fraction models', true, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440075', '550e8400-e29b-41d4-a716-446655440002', 'Science', '2024-08-29', 'Experiment', 60, 'Earth layers demonstration with playdough', true, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440076', '550e8400-e29b-41d4-a716-446655440002', 'Science', '2024-08-30', 'Field Trip', 90, 'Rock collection and identification', true, NOW(), NOW()),
    
    -- Lilly's activities
    ('550e8400-e29b-41d4-a716-446655440077', '550e8400-e29b-41d4-a716-446655440003', 'Mathematics', '2024-08-26', 'Lesson', 40, 'Addition with regrouping review', true, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440078', '550e8400-e29b-41d4-a716-446655440003', 'Mathematics', '2024-08-26', 'Practice', 20, 'Addition problems worksheet', true, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440079', '550e8400-e29b-41d4-a716-446655440003', 'Mathematics', '2024-08-27', 'Lesson', 40, 'Subtraction with borrowing', true, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440080', '550e8400-e29b-41d4-a716-446655440003', 'Reading', '2024-08-28', 'Lesson', 35, 'Phonics review and practice', true, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440081', '550e8400-e29b-41d4-a716-446655440003', 'Reading', '2024-08-28', 'Reading', 25, 'Independent reading time', true, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440082', '550e8400-e29b-41d4-a716-446655440003', 'Art', '2024-08-30', 'Project', 45, 'Watercolor painting project', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Create learning assessments for tracking mastery
INSERT INTO learning_assessments (id, child_id, subject_name, assessment_date, assessment_type, score_percentage, notes, created_at, updated_at)
VALUES 
    -- Max's assessments
    ('550e8400-e29b-41d4-a716-446655440083', '550e8400-e29b-41d4-a716-446655440002', 'Mathematics', '2024-08-26', 'Quiz', 85, 'Fractions basics quiz - good understanding', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440084', '550e8400-e29b-41d4-a716-446655440002', 'Mathematics', '2024-08-28', 'Quiz', 90, 'Fraction models quiz - excellent work', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440085', '550e8400-e29b-41d4-a716-446655440002', 'Science', '2024-08-30', 'Project', 95, 'Earth layers model - outstanding creativity', NOW(), NOW()),
    
    -- Lilly's assessments
    ('550e8400-e29b-41d4-a716-446655440086', '550e8400-e29b-41d4-a716-446655440003', 'Mathematics', '2024-08-26', 'Quiz', 92, 'Addition quiz - mastered regrouping', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440087', '550e8400-e29b-41d4-a716-446655440003', 'Mathematics', '2024-08-27', 'Quiz', 88, 'Subtraction quiz - improving with borrowing', NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440088', '550e8400-e29b-41d4-a716-446655440003', 'Reading', '2024-08-28', 'Reading Test', 90, 'Phonics assessment - excellent progress', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Create learning goals for tracking objectives
INSERT INTO learning_goals (id, child_id, subject_name, goal_description, target_date, current_status, progress_percentage, created_at, updated_at)
VALUES 
    -- Max's goals
    ('550e8400-e29b-41d4-a716-446655440089', '550e8400-e29b-41d4-a716-446655440002', 'Mathematics', 'Master fraction operations (addition, subtraction)', '2024-12-31', 'In Progress', 60, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440090', '550e8400-e29b-41d4-a716-446655440002', 'Science', 'Complete Earth science unit with experiments', '2024-11-30', 'In Progress', 40, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440091', '550e8400-e29b-41d4-a716-446655440002', 'Language Arts', 'Improve writing structure and organization', '2025-01-31', 'In Progress', 25, NOW(), NOW()),
    
    -- Lilly's goals
    ('550e8400-e29b-41d4-a716-446655440092', '550e8400-e29b-41d4-a716-446655440003', 'Mathematics', 'Master subtraction with borrowing', '2024-10-31', 'In Progress', 70, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440093', '550e8400-e29b-41d4-a716-446655440003', 'Reading', 'Read chapter books independently', '2024-12-31', 'In Progress', 50, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440094', '550e8400-e29b-41d4-a716-446655440003', 'Art', 'Complete art portfolio with 10 projects', '2025-01-31', 'In Progress', 30, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Final verification of all demo data
SELECT 'Complete Demo Data Summary:' as info;
SELECT 'Families:' as category, COUNT(*) as count FROM families
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
SELECT 'Class Day Mappings:', COUNT(*) FROM class_day_mappings
UNION ALL
SELECT 'Learning Progress:', COUNT(*) FROM learning_progress
UNION ALL
SELECT 'Learning Activities:', COUNT(*) FROM learning_activities
UNION ALL
SELECT 'Learning Assessments:', COUNT(*) FROM learning_assessments
UNION ALL
SELECT 'Learning Goals:', COUNT(*) FROM learning_goals;

SELECT 'Max and Lilly Demo Data Complete!' as status;
SELECT 'You can now demo:' as info;
SELECT '1. Calendar updates and schedule management' as feature;
SELECT '2. Progress tracking across subjects' as feature;
SELECT '3. Attendance and activity logging' as feature;
SELECT '4. Analytics and reporting capabilities' as feature;
