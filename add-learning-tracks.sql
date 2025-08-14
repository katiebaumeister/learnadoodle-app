-- Add Learning Track Data
-- This creates curriculum tracks for Max and Lilly using the actual subject_track table structure

-- ========================================
-- LEARNING TRACKS DATA
-- ========================================
-- The subject_track table is actually a learning track/curriculum planning table
-- It has: name, start_date, end_date, class_schedule, study_days, roadmap, etc.

INSERT INTO subject_track (
    id,
    family_id,
    name,
    start_date,
    end_date,
    class_schedule,
    study_days,
    travel_minutes,
    platform,
    link,
    initial_plan,
    busy_time,
    roadmap,
    course_outline,
    status,
    family_year_id,
    created_at,
    updated_at
) VALUES
    -- Max's Math Learning Track
    ('550e8400-e29b-41d4-a716-446655440100', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', 'Max Math Track - 4th Grade', '2024-08-26', '2025-06-06', 'Monday, Wednesday, Friday 9:00-10:30', 'Monday, Wednesday, Friday', 0, 'Homeschool', NULL, 'Focus on fractions, decimals, and problem solving', 'Afternoons free for activities', '{"units": ["Fractions", "Decimals", "Geometry", "Problem Solving"], "milestones": ["Master basic fractions", "Understand decimals", "Solve word problems"]}', 'Unit 1: Fractions (Weeks 1-6)\nUnit 2: Decimals (Weeks 7-12)\nUnit 3: Geometry (Weeks 13-18)\nUnit 4: Problem Solving (Weeks 19-24)', 'active', '550e8400-e29b-41d4-a716-446655440080', NOW(), NOW()),

    -- Max's Science Learning Track
    ('550e8400-e29b-41d4-a716-446655440101', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', 'Max Science Track - 4th Grade', '2024-08-26', '2025-06-06', 'Monday, Wednesday 10:30-12:00', 'Monday, Wednesday', 0, 'Homeschool', NULL, 'Earth science and simple experiments', 'Mornings focused on science', '{"units": ["Earth Science", "Simple Experiments", "Scientific Method"], "milestones": ["Understand Earth structure", "Conduct experiments", "Use scientific method"]}', 'Unit 1: Earth Science (Weeks 1-8)\nUnit 2: Simple Experiments (Weeks 9-16)\nUnit 3: Scientific Method (Weeks 17-24)', 'active', '550e8400-e29b-41d4-a716-446655440080', NOW(), NOW()),

    -- Max's Language Arts Learning Track
    ('550e8400-e29b-41d4-a716-446655440102', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', 'Max Language Arts Track - 4th Grade', '2024-08-26', '2025-06-06', 'Tuesday, Thursday 9:00-10:30', 'Tuesday, Thursday', 0, 'Homeschool', NULL, 'Reading comprehension and writing skills', 'Mornings for language arts', '{"units": ["Reading Comprehension", "Writing Skills", "Grammar", "Vocabulary"], "milestones": ["Read chapter books", "Write paragraphs", "Use proper grammar"]}', 'Unit 1: Reading Comprehension (Weeks 1-6)\nUnit 2: Writing Skills (Weeks 7-12)\nUnit 3: Grammar (Weeks 13-18)\nUnit 4: Vocabulary (Weeks 19-24)', 'active', '550e8400-e29b-41d4-a716-446655440080', NOW(), NOW()),

    -- Lilly's Math Learning Track
    ('550e8400-e29b-41d4-a716-446655440103', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', 'Lilly Math Track - 2nd Grade', '2024-08-26', '2025-06-06', 'Tuesday, Thursday 10:30-12:00', 'Tuesday, Thursday', 0, 'Homeschool', NULL, 'Addition, subtraction, and place value', 'Mornings for math practice', '{"units": ["Addition", "Subtraction", "Place Value", "Money"], "milestones": ["Master two-digit addition", "Understand subtraction", "Count money"]}', 'Unit 1: Addition (Weeks 1-6)\nUnit 2: Subtraction (Weeks 7-12)\nUnit 3: Place Value (Weeks 13-18)\nUnit 4: Money (Weeks 19-24)', 'active', '550e8400-e29b-41d4-a716-446655440080', NOW(), NOW()),

    -- Lilly's Reading Learning Track
    ('550e8400-e29b-41d4-a716-446655440104', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', 'Lilly Reading Track - 2nd Grade', '2024-08-26', '2025-06-06', 'Monday, Wednesday, Friday 10:30-12:00', 'Monday, Wednesday, Friday', 0, 'Homeschool', NULL, 'Phonics and early reading skills', 'Mornings for reading', '{"units": ["Phonics", "Sight Words", "Reading Comprehension", "Fluency"], "milestones": ["Master phonics", "Read independently", "Understand stories"]}', 'Unit 1: Phonics (Weeks 1-8)\nUnit 2: Sight Words (Weeks 9-16)\nUnit 3: Reading Comprehension (Weeks 17-24)', 'active', '550e8400-e29b-41d4-a716-446655440080', NOW(), NOW()),

    -- Lilly's Art Learning Track
    ('550e8400-e29b-41d4-a716-446655440105', '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9', 'Lilly Art Track - 2nd Grade', '2024-08-26', '2025-06-06', 'Friday 2:00-3:30', 'Friday', 0, 'Homeschool', NULL, 'Creative expression and basic techniques', 'Friday afternoons for art', '{"units": ["Drawing", "Painting", "Crafts", "Art History"], "milestones": ["Use basic art tools", "Create original artwork", "Understand art concepts"]}', 'Unit 1: Drawing (Weeks 1-6)\nUnit 2: Painting (Weeks 7-12)\nUnit 3: Crafts (Weeks 13-18)\nUnit 4: Art History (Weeks 19-24)', 'active', '550e8400-e29b-41d4-a716-446655440080', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ========================================
-- UPDATE LESSONS WITH SUBJECT_TRACK_ID
-- ========================================
-- Now that we have learning track records, let's update the lessons to link to them

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
SELECT '=== LEARNING TRACKS COUNT ===' as info;
SELECT COUNT(*) as total_tracks FROM subject_track WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9';

SELECT '=== LESSONS WITH TRACKS ===' as info;
SELECT COUNT(*) as lessons_with_tracks FROM lessons WHERE subject_track_id IS NOT NULL;

-- Show the learning tracks created
SELECT '=== LEARNING TRACKS CREATED ===' as info;
SELECT 
    name,
    class_schedule,
    study_days,
    status,
    start_date,
    end_date
FROM subject_track 
WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'
ORDER BY name;

-- Show which lessons got linked to which tracks
SELECT '=== LESSON TRACK MAPPINGS ===' as info;
SELECT 
    l.content_summary,
    l.subject_track_id,
    st.name as track_name
FROM lessons l
LEFT JOIN subject_track st ON l.subject_track_id = st.id
WHERE l.subject_track_id IS NOT NULL
ORDER BY l.sequence_no;
