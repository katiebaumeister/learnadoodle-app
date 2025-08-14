-- Add Calendar Schedule Data - FIXED VERSION
-- This handles the potential column mismatch in class_days

-- ========================================
-- FIRST, LET'S CHECK WHAT WE'RE WORKING WITH
-- ========================================
SELECT '=== CHECKING CLASS_DAYS STRUCTURE ===' as info;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'class_days' 
ORDER BY ordinal_position;

-- ========================================
-- HOLIDAYS DATA (This should work)
-- ========================================
-- Your holidays table uses family_year_id

-- First, let's create a family_year record if it doesn't exist
INSERT INTO family_years (id, family_id, academic_year_id, created_at, updated_at)
VALUES ('550e8400-e29b-41d4-a716-446655440080', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', '550e8400-e29b-41d4-a716-446655440004', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Now add holidays using the family_year_id
INSERT INTO holidays (
    id,
    family_year_id,
    holiday_name,
    holiday_date,
    description,
    is_proposed,
    created_at,
    updated_at
) VALUES
    ('550e8400-e29b-41d4-a716-446655440090', '550e8400-e29b-41d4-a716-446655440080', 'Labor Day', '2024-09-02', 'Federal holiday - no school', false, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440091', '550e8400-e29b-41d4-a716-446655440080', 'Thanksgiving Break', '2024-11-28', 'Thanksgiving holiday - no school', false, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440092', '550e8400-e29b-41d4-a716-446655440080', 'Christmas Break', '2024-12-25', 'Christmas holiday - no school', false, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440093', '550e8400-e29b-41d4-a716-446655440080', 'New Year''s Day', '2025-01-01', 'New Year holiday - no school', false, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440094', '550e8400-e29b-41d4-a716-446655440080', 'Martin Luther King Jr. Day', '2025-01-20', 'Federal holiday - no school', false, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440095', '550e8400-e29b-41d4-a716-446655440080', 'President''s Day', '2025-02-17', 'Federal holiday - no school', false, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440096', '550e8400-e29b-41d4-a716-446655440080', 'Spring Break', '2025-03-17', 'Spring break week - no school', false, NOW(), NOW()),
    ('550e8400-e29b-41d4-a716-446655440097', '550e8400-e29b-41d4-a716-446655440080', 'Memorial Day', '2025-05-26', 'Federal holiday - no school', false, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ========================================
-- SUBJECT_TRACK DATA
-- ========================================
INSERT INTO subject_track (
    id,
    subject_id,
    family_id
) VALUES
    ('550e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440010', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'), -- Max's Math track
    ('550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440011', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'), -- Max's Science track
    ('550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440012', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'), -- Max's Language Arts track
    ('550e8400-e29b-41d4-a716-446655440103', '550e8400-e29b-41d4-a716-446655440013', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'), -- Lilly's Math track
    ('550e8400-e29b-41d4-a716-446655440104', '550e8400-e29b-41d4-a716-446655440014', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'), -- Lilly's Reading track
    ('550e8400-e29b-41d4-a716-446655440105', '550e8400-e29b-41d4-a716-446655440015', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9')  -- Lilly's Art track
ON CONFLICT DO NOTHING;

-- ========================================
-- UPDATE LESSONS WITH SUBJECT_TRACK_ID
-- ========================================
UPDATE lessons 
SET subject_track_id = '550e8400-e29b-41d4-a716-446655440100'
WHERE content_summary LIKE '%Fractions%' OR content_summary LIKE '%Math%';

UPDATE lessons 
SET subject_track_id = '550e8400-e29b-41d4-a716-446655440101'
WHERE content_summary LIKE '%Science%' OR content_summary LIKE '%Earth%' OR content_summary LIKE '%Rocks%';

UPDATE lessons 
SET subject_track_id = '550e8400-e29b-41d4-a716-446655440102'
WHERE content_summary LIKE '%Language%' OR content_summary LIKE '%Reading%' OR content_summary LIKE '%Writing%';

UPDATE lessons 
SET subject_track_id = '550e8400-e29b-41d4-a716-446655440103'
WHERE content_summary LIKE '%Addition%' OR content_summary LIKE '%Subtraction%';

UPDATE lessons 
SET subject_track_id = '550e8400-e29b-41d4-a716-446655440104'
WHERE content_summary LIKE '%Phonics%' OR content_summary LIKE '%Comprehension%';

UPDATE lessons 
SET subject_track_id = '550e8400-e29b-41d4-a716-446655440105'
WHERE content_summary LIKE '%Art%' OR content_summary LIKE '%Creative%';

-- ========================================
-- VERIFICATION
-- ========================================
SELECT '=== HOLIDAYS COUNT ===' as info;
SELECT COUNT(*) as total_holidays FROM holidays WHERE family_year_id = '550e8400-e29b-41d4-a716-446655440080';

SELECT '=== SUBJECT_TRACK COUNT ===' as info;
SELECT COUNT(*) as total_subject_tracks FROM subject_track WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

SELECT '=== LESSONS WITH TRACKS ===' as info;
SELECT COUNT(*) as lessons_with_tracks FROM lessons WHERE subject_track_id IS NOT NULL;

-- ========================================
-- NOTE ABOUT CLASS_DAYS
-- ========================================
SELECT '=== NEXT STEPS ===' as info;
SELECT 'Run check-class-days-exact.sql to see the actual class_days structure' as next_step;
SELECT 'Then we can fix the class_days insertions with the correct columns' as next_step2;
