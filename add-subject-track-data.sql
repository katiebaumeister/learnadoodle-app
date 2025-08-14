-- Add Subject Track Data
-- This connects subjects to learning tracks/progressions

-- ========================================
-- SUBJECT_TRACK DATA
-- ========================================
-- Based on the schema: id, subject_track_id, subject_id, family_id

INSERT INTO subject_track (
    id,
    subject_track_id,
    subject_id,
    family_id
) VALUES
    ('550e8400-e29b-41d4-a716-446655440100', NULL, '550e8400-e29b-41d4-a716-446655440010', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'), -- Max's Math track
    ('550e8400-e29b-41d4-a716-446655440101', NULL, '550e8400-e29b-41d4-a716-446655440011', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'), -- Max's Science track
    ('550e8400-e29b-41d4-a716-446655440102', NULL, '550e8400-e29b-41d4-a716-446655440012', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'), -- Max's Language Arts track
    ('550e8400-e29b-41d4-a716-446655440103', NULL, '550e8400-e29b-41d4-a716-446655440013', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'), -- Lilly's Math track
    ('550e8400-e29b-41d4-a716-446655440104', NULL, '550e8400-e29b-41d4-a716-446655440014', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'), -- Lilly's Reading track
    ('550e8400-e29b-41d4-a716-446655440105', NULL, '550e8400-e29b-41d4-a716-446655440015', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9')  -- Lilly's Art track
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
SELECT '=== SUBJECT_TRACK COUNT ===' as info;
SELECT COUNT(*) as total_subject_tracks FROM subject_track WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

SELECT '=== LESSONS WITH TRACKS ===' as info;
SELECT COUNT(*) as lessons_with_tracks FROM lessons WHERE subject_track_id IS NOT NULL;

-- Show which lessons got linked to which tracks
SELECT '=== LESSON TRACK MAPPINGS ===' as info;
SELECT 
    l.content_summary,
    l.subject_track_id,
    st.id as track_id
FROM lessons l
LEFT JOIN subject_track st ON l.subject_track_id = st.id
WHERE l.subject_track_id IS NOT NULL
ORDER BY l.sequence_no;
