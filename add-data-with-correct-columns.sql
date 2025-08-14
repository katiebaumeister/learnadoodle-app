-- Add Data with Correct Column Names
-- Based on actual table structures found

-- ========================================
-- LESSONS DATA
-- ========================================
-- Lessons table has: id, family_id, summary, plan, created_at, subject_track_id, progress, 
-- calendar_day_id, sequence_no, ai_progress_analysis, last_ai_review, academic_year_id, 
-- lesson_date, content_summary, content_details, updated_at, is_auto

INSERT INTO lessons (
    id, 
    family_id,
    academic_year_id,
    lesson_date,
    content_summary,
    content_details,
    sequence_no,
    created_at,
    updated_at
) VALUES 
    -- Max's Math lessons
    ('550e8400-e29b-41d4-a716-446655440020', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '550e8400-e29b-41d4-a716-446655440004', '2024-08-26', 'Introduction to Fractions', 'Understanding what fractions represent, basic fraction notation', 1, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440021', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '550e8400-e29b-41d4-a716-446655440004', '2024-08-27', 'Fraction Models', 'Using visual models to represent fractions', 2, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440022', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '550e8400-e29b-41d4-a716-446655440004', '2024-08-28', 'Comparing Fractions', 'Using number lines and models to compare fractions', 3, NOW(), NOW()),
    
    -- Max's Science lessons
    ('550e8400-e29b-41d4-a716-446655440023', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '550e8400-e29b-41d4-a716-446655440004', '2024-08-29', 'Earth''s Layers', 'Introduction to the structure of Earth', 4, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440024', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '550e8400-e29b-41d4-a716-446655440004', '2024-08-30', 'Rocks and Minerals', 'Identifying different types of rocks', 5, NOW(), NOW()),
    
    -- Lilly's Math lessons
    ('550e8400-e29b-41d4-a716-446655440025', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '550e8400-e29b-41d4-a716-446655440004', '2024-08-26', 'Addition Review', 'Two-digit addition with regrouping', 6, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440026', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '550e8400-e29b-41d4-a716-446655440004', '2024-08-27', 'Subtraction Practice', 'Two-digit subtraction with borrowing', 7, NOW(), NOW()),
    
    -- Lilly's Reading lessons
    ('550e8400-e29b-41d4-a716-446655440027', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '550e8400-e29b-41d4-a716-446655440004', '2024-08-28', 'Phonics Review', 'Consonant blends and digraphs', 8, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440028', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '550e8400-e29b-41d4-a716-446655440004', '2024-08-29', 'Reading Comprehension', 'Understanding story elements', 9, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ========================================
-- ATTENDANCE DATA
-- ========================================
-- Attendance table has: id, child_id, attendance_date, attended, notes, checked_at, family_id, academic_year_id
-- Note: Removed family_id to avoid foreign key constraint error

INSERT INTO attendance (
    id, 
    child_id, 
    academic_year_id,
    attendance_date, 
    attended, 
    notes, 
    checked_at
) VALUES 
    -- Max's attendance
    ('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440004', '2024-08-26', true, 'Great participation in math', NOW()),
    ('550e8400-e29b-41d4-a716-446655440031', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440004', '2024-08-27', true, 'Excited about fractions', NOW()),
    ('550e8400-e29b-41d4-a716-446655440032', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440004', '2024-08-28', true, 'Math lesson completed', NOW()),
    ('550e8400-e29b-41d4-a716-446655440033', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440004', '2024-08-29', true, 'Science experiment day', NOW()),
    ('550e8400-e29b-41d4-a716-446655440034', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440004', '2024-08-30', true, 'Rocks and minerals lesson', NOW()),
    
    -- Lilly's attendance
    ('550e8400-e29b-41d4-a716-446655440035', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440004', '2024-08-26', true, 'Math addition practice', NOW()),
    ('550e8400-e29b-41d4-a716-446655440036', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440004', '2024-08-27', true, 'Subtraction with borrowing', NOW()),
    ('550e8400-e29b-41d4-a716-446655440037', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440004', '2024-08-28', true, 'Phonics review session', NOW()),
    ('550e8400-e29b-41d4-a716-446655440038', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440004', '2024-08-29', true, 'Reading comprehension', NOW()),
    ('550e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440004', '2024-08-30', false, 'Family appointment', NOW())
ON CONFLICT DO NOTHING;

-- ========================================
-- VERIFICATION
-- ========================================
SELECT 'Data Added Successfully!' as status;
SELECT 'Lessons added:' as info, COUNT(*) as count FROM lessons WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
UNION ALL
SELECT 'Attendance records added:', COUNT(*) FROM attendance WHERE child_id IN ('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440003');
