-- Add Calendar Schedule Data - CORRECTED VERSION
-- This uses the actual column names from your database schema

-- ========================================
-- CLASS_DAYS DATA
-- ========================================
-- Your class_days table has: id, academic_year_id, class_date, class_day_number, is_vacation, created_at, updated_at

INSERT INTO class_days (
    id,
    academic_year_id,
    class_date,
    class_day_number,
    is_vacation,
    created_at,
    updated_at
) VALUES
    -- Week 1: August 26-30, 2024
    ('550e8400-e29b-41d4-a716-446655440060', '550e8400-e29b-41d4-a716-446655440004', '2024-08-26', 1, false, NOW(), NOW()), -- Monday - Day 1
    ('550e8400-e29b-41d4-a716-446655440061', '550e8400-e29b-41d4-a716-446655440004', '2024-08-27', 2, false, NOW(), NOW()), -- Tuesday - Day 2
    ('550e8400-e29b-41d4-a716-446655440062', '550e8400-e29b-41d4-a716-446655440004', '2024-08-28', 3, false, NOW(), NOW()), -- Wednesday - Day 3
    ('550e8400-e29b-41d4-a716-446655440063', '550e8400-e29b-41d4-a716-446655440004', '2024-08-29', 4, false, NOW(), NOW()), -- Thursday - Day 4
    ('550e8400-e29b-41d4-a716-446655440064', '550e8400-e29b-41d4-a716-446655440004', '2024-08-30', 5, false, NOW(), NOW()), -- Friday - Day 5

    -- Week 2: September 2-6, 2024 (Labor Day week)
    ('550e8400-e29b-41d4-a716-446655440065', '550e8400-e29b-41d4-a716-446655440004', '2024-09-02', NULL, true, NOW(), NOW()), -- Monday - Labor Day (vacation)
    ('550e8400-e29b-41d4-a716-446655440066', '550e8400-e29b-41d4-a716-446655440004', '2024-09-03', 6, false, NOW(), NOW()), -- Tuesday - Day 6
    ('550e8400-e29b-41d4-a716-446655440067', '550e8400-e29b-41d4-a716-446655440004', '2024-09-04', 7, false, NOW(), NOW()), -- Wednesday - Day 7
    ('550e8400-e29b-41d4-a716-446655440068', '550e8400-e29b-41d4-a716-446655440004', '2024-09-05', 8, false, NOW(), NOW()), -- Thursday - Day 8
    ('550e8400-e29b-41d4-a716-446655440069', '550e8400-e29b-41d4-a716-446655440004', '2024-09-06', 9, false, NOW(), NOW()), -- Friday - Day 9

    -- Week 3: September 9-13, 2024
    ('550e8400-e29b-41d4-a716-446655440070', '550e8400-e29b-41d4-a716-446655440004', '2024-09-09', 10, false, NOW(), NOW()), -- Monday - Day 10
    ('550e8400-e29b-41d4-a716-446655440071', '550e8400-e29b-41d4-a716-446655440004', '2024-09-10', 11, false, NOW(), NOW()), -- Tuesday - Day 11
    ('550e8400-e29b-41d4-a716-446655440072', '550e8400-e29b-41d4-a716-446655440004', '2024-09-11', 12, false, NOW(), NOW()), -- Wednesday - Day 12
    ('550e8400-e29b-41d4-a716-446655440073', '550e8400-e29b-41d4-a716-446655440004', '2024-09-12', 13, false, NOW(), NOW()), -- Thursday - Day 13
    ('550e8400-e29b-41d4-a716-446655440074', '550e8400-e29b-41d4-a716-446655440004', '2024-09-13', 14, false, NOW(), NOW())  -- Friday - Day 14
ON CONFLICT DO NOTHING;

-- ========================================
-- HOLIDAYS DATA
-- ========================================
-- Your holidays table uses family_year_id (not academic_year_id)
-- We need to get the family_year_id from academic_years first

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
-- SUBJECT_TRACK DATA (Optional - for advanced tracking)
-- ========================================
-- This connects subjects to learning tracks/progressions

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
-- Now that we have subject_track records, let's update the lessons to link to them

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
-- VERIFICATION QUERIES
-- ========================================
-- Run these to verify the data was inserted correctly

SELECT '=== CLASS_DAYS COUNT ===' as info;
SELECT COUNT(*) as total_class_days FROM class_days WHERE academic_year_id = '550e8400-e29b-41d4-a716-446655440004';

SELECT '=== HOLIDAYS COUNT ===' as info;
SELECT COUNT(*) as total_holidays FROM holidays WHERE family_year_id = '550e8400-e29b-41d4-a716-446655440080';

SELECT '=== SUBJECT_TRACK COUNT ===' as info;
SELECT COUNT(*) as total_subject_tracks FROM subject_track WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

SELECT '=== LESSONS WITH TRACKS ===' as info;
SELECT COUNT(*) as lessons_with_tracks FROM lessons WHERE subject_track_id IS NOT NULL;
