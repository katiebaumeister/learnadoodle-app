-- =====================================================
-- Seed Planner Data: December 27 - January 27
-- =====================================================
-- This script creates seed data for the planner covering Dec 27, 2025 - Jan 27, 2026
-- Includes: lessons, activities, sport, appointment, extracurricular, trip, holiday, project, assessment, homework
--
-- NOTE: You must replace the placeholder values before running:
--   - Replace 'FAMILY_ID_PLACEHOLDER' with actual family_id UUID
--   - Replace 'CHILD_1_ID', 'CHILD_2_ID', 'CHILD_3_ID' with actual child_id UUIDs
--   - Replace 'SUBJECT_MATH_ID', 'SUBJECT_SCIENCE_ID', 'SUBJECT_ELA_ID' with actual subject_id UUIDs (or use NULL)

-- Example query to get IDs:
-- SELECT id FROM family LIMIT 1;
-- SELECT id FROM children WHERE family_id = 'YOUR_FAMILY_ID' ORDER BY created_at LIMIT 3;
-- SELECT id FROM subject WHERE family_id = 'YOUR_FAMILY_ID' AND name ILIKE '%math%' LIMIT 1;

DO $$
DECLARE
  v_family_id UUID := 'FAMILY_ID_PLACEHOLDER'::UUID;  -- REPLACE THIS
  v_child_1 UUID := 'CHILD_1_ID_PLACEHOLDER'::UUID;   -- REPLACE THIS
  v_child_2 UUID := 'CHILD_2_ID_PLACEHOLDER'::UUID;   -- REPLACE THIS
  v_child_3 UUID := 'CHILD_3_ID_PLACEHOLDER'::UUID;   -- REPLACE THIS
  v_subject_math UUID;    -- Optional: Set to actual subject_id or leave NULL
  v_subject_science UUID; -- Optional: Set to actual subject_id or leave NULL
  v_subject_ela UUID;     -- Optional: Set to actual subject_id or leave NULL
BEGIN
  -- =====================================================
  -- LESSONS (2 per child)
  -- =====================================================
  
  -- Child 1: Math Lesson 1 - Introduction to Fractions (Dec 27, 10:00 AM - 11:00 AM)
  INSERT INTO events (
    family_id, child_id, title, description, event_type, subject_id, unit,
    start_ts, end_ts, status, source, minutes, location, mode, instructor, grade, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_1, 'Math: Introduction to Fractions',
    'Learning the basics of fractions, numerator and denominator concepts',
    'Lesson', v_subject_math, 'Unit 3: Fractions',
    '2025-12-27 10:00:00-05', '2025-12-27 11:00:00-05',
    'scheduled', 'manual', 60, 'Home Classroom', 'in-person', 'Parent', '4th',
    ARRAY['math', 'fractions', 'lesson']::text[],
    NOW(), NOW()
  );

  -- Child 1: Science Lesson 1 - States of Matter (Dec 30, 2:00 PM - 3:00 PM)
  INSERT INTO events (
    family_id, child_id, title, description, event_type, subject_id, unit,
    start_ts, end_ts, status, source, minutes, location, mode, instructor, grade, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_1, 'Science: States of Matter',
    'Exploring solid, liquid, and gas states with hands-on experiments',
    'Lesson', v_subject_science, 'Unit 2: Matter and Energy',
    '2025-12-30 14:00:00-05', '2025-12-30 15:00:00-05',
    'scheduled', 'manual', 60, 'Home Lab', 'in-person', 'Parent', '4th',
    ARRAY['science', 'chemistry', 'hands-on']::text[],
    NOW(), NOW()
  );

  -- Child 2: ELA Lesson 1 - Reading Comprehension (Dec 28, 9:00 AM - 10:30 AM)
  INSERT INTO events (
    family_id, child_id, title, description, event_type, subject_id, unit,
    start_ts, end_ts, status, source, minutes, location, mode, instructor, grade, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_2, 'ELA: Reading Comprehension Practice',
    'Working on reading strategies and understanding text structure',
    'Lesson', v_subject_ela, 'Unit 4: Reading Strategies',
    '2025-12-28 09:00:00-05', '2025-12-28 10:30:00-05',
    'scheduled', 'manual', 90, 'Library', 'in-person', 'Parent', '5th',
    ARRAY['ela', 'reading', 'comprehension']::text[],
    NOW(), NOW()
  );

  -- Child 2: Math Lesson 1 - Multiplication Tables (Dec 31, 11:00 AM - 12:00 PM)
  INSERT INTO events (
    family_id, child_id, title, description, event_type, subject_id, unit,
    start_ts, end_ts, status, source, minutes, location, mode, instructor, grade, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_2, 'Math: Multiplication Practice',
    'Drilling multiplication tables and word problems',
    'Lesson', v_subject_math, 'Unit 1: Multiplication Basics',
    '2025-12-31 11:00:00-05', '2025-12-31 12:00:00-05',
    'scheduled', 'manual', 60, 'Home Classroom', 'in-person', 'Parent', '5th',
    ARRAY['math', 'multiplication', 'practice']::text[],
    NOW(), NOW()
  );

  -- Child 3: Science Lesson 1 - Plant Life Cycle (Jan 2, 1:00 PM - 2:00 PM)
  INSERT INTO events (
    family_id, child_id, title, description, event_type, subject_id, unit,
    start_ts, end_ts, status, source, minutes, location, mode, instructor, grade, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_3, 'Science: Plant Life Cycle',
    'Observing and documenting the stages of plant growth',
    'Lesson', v_subject_science, 'Unit 5: Biology Basics',
    '2026-01-02 13:00:00-05', '2026-01-02 14:00:00-05',
    'scheduled', 'manual', 60, 'Garden', 'in-person', 'Parent', '3rd',
    ARRAY['science', 'biology', 'plants']::text[],
    NOW(), NOW()
  );

  -- Child 3: ELA Lesson 1 - Creative Writing (Jan 3, 10:00 AM - 11:30 AM)
  INSERT INTO events (
    family_id, child_id, title, description, event_type, subject_id, unit,
    start_ts, end_ts, status, source, minutes, location, mode, instructor, grade, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_3, 'ELA: Creative Writing Workshop',
    'Writing short stories and developing narrative skills',
    'Lesson', v_subject_ela, 'Unit 3: Writing Composition',
    '2026-01-03 10:00:00-05', '2026-01-03 11:30:00-05',
    'scheduled', 'manual', 90, 'Study Room', 'in-person', 'Parent', '3rd',
    ARRAY['ela', 'writing', 'creative']::text[],
    NOW(), NOW()
  );

  -- =====================================================
  -- ACTIVITIES (2 per child)
  -- =====================================================

  -- Child 1: Art Activity - Watercolor Painting (Dec 29, 3:00 PM - 4:30 PM)
  INSERT INTO events (
    family_id, child_id, title, description, event_type,
    start_ts, end_ts, status, source, minutes, location, mode, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_1, 'Art: Watercolor Painting',
    'Creating landscape paintings using watercolor techniques',
    'Activity',
    '2025-12-29 15:00:00-05', '2025-12-29 16:30:00-05',
    'scheduled', 'manual', 90, 'Art Studio', 'in-person',
    ARRAY['art', 'painting', 'watercolor']::text[],
    NOW(), NOW()
  );

  -- Child 1: Cooking Activity - Baking Cookies (Jan 6, 2:00 PM - 3:30 PM)
  INSERT INTO events (
    family_id, child_id, title, description, event_type,
    start_ts, end_ts, status, source, minutes, location, mode, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_1, 'Cooking: Holiday Cookie Baking',
    'Learning measurements, following recipes, and kitchen safety',
    'Activity',
    '2026-01-06 14:00:00-05', '2026-01-06 15:30:00-05',
    'scheduled', 'manual', 90, 'Kitchen', 'in-person',
    ARRAY['cooking', 'baking', 'math']::text[],
    NOW(), NOW()
  );

  -- Child 2: Music Activity - Piano Practice (Jan 4, 4:00 PM - 5:00 PM)
  INSERT INTO events (
    family_id, child_id, title, description, event_type,
    start_ts, end_ts, status, source, minutes, location, mode, instructor, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_2, 'Music: Piano Practice Session',
    'Working on scales and a new piece for recital',
    'Activity',
    '2026-01-04 16:00:00-05', '2026-01-04 17:00:00-05',
    'scheduled', 'manual', 60, 'Music Room', 'in-person', 'Music Teacher',
    ARRAY['music', 'piano', 'practice']::text[],
    NOW(), NOW()
  );

  -- Child 2: Building Activity - LEGO Engineering (Jan 7, 1:00 PM - 2:30 PM)
  INSERT INTO events (
    family_id, child_id, title, description, event_type,
    start_ts, end_ts, status, source, minutes, location, mode, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_2, 'Building: LEGO Engineering Challenge',
    'Designing and building structures with LEGO technic pieces',
    'Activity',
    '2026-01-07 13:00:00-05', '2026-01-07 14:30:00-05',
    'scheduled', 'manual', 90, 'Playroom', 'in-person',
    ARRAY['building', 'lego', 'engineering']::text[],
    NOW(), NOW()
  );

  -- Child 3: Nature Activity - Bird Watching (Dec 27, 11:00 AM - 12:30 PM)
  INSERT INTO events (
    family_id, child_id, title, description, event_type,
    start_ts, end_ts, status, source, minutes, location, mode, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_3, 'Nature: Bird Watching Walk',
    'Identifying local birds and documenting observations in nature journal',
    'Activity',
    '2025-12-27 11:00:00-05', '2025-12-27 12:30:00-05',
    'scheduled', 'manual', 90, 'Local Park', 'outdoor',
    ARRAY['nature', 'bird-watching', 'science']::text[],
    NOW(), NOW()
  );

  -- Child 3: Coding Activity - Scratch Programming (Jan 8, 3:00 PM - 4:30 PM)
  INSERT INTO events (
    family_id, child_id, title, description, event_type,
    start_ts, end_ts, status, source, minutes, location, mode, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_3, 'Coding: Scratch Animation Project',
    'Creating an animated story using Scratch programming blocks',
    'Activity',
    '2026-01-08 15:00:00-05', '2026-01-08 16:30:00-05',
    'scheduled', 'manual', 90, 'Computer Lab', 'online',
    ARRAY['coding', 'scratch', 'programming']::text[],
    NOW(), NOW()
  );

  -- =====================================================
  -- SPORT (for one child)
  -- =====================================================

  -- Child 1: Soccer Practice - Recurring Weekly (Thursdays 4:00 PM - 5:30 PM)
  INSERT INTO events (
    family_id, child_id, title, description, event_type,
    start_ts, end_ts, status, source, minutes, location, mode, instructor, tags,
    recurrence_rule, created_at, updated_at
  ) VALUES (
    v_family_id, v_child_1, 'Soccer Practice',
    'Weekly team practice focusing on dribbling and passing skills',
    'Sport',
    '2026-01-02 16:00:00-05', '2026-01-02 17:30:00-05',
    'scheduled', 'manual', 90, 'Community Soccer Field', 'in-person', 'Coach Martinez',
    ARRAY['sports', 'soccer', 'team']::text[],
    '{"frequency": "WEEKLY", "interval": 1, "until": "2026-01-27"}'::jsonb,
    NOW(), NOW()
  );

  -- =====================================================
  -- APPOINTMENT (for one child)
  -- =====================================================

  -- Child 2: Dental Checkup (Jan 10, 10:00 AM - 11:00 AM)
  INSERT INTO events (
    family_id, child_id, title, description, event_type,
    start_ts, end_ts, status, source, minutes, location, mode, instructor, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_2, 'Dental Checkup',
    'Routine dental examination and cleaning',
    'Appointment',
    '2026-01-10 10:00:00-05', '2026-01-10 11:00:00-05',
    'scheduled', 'manual', 60, 'Family Dental Clinic', 'in-person', 'Dr. Johnson',
    ARRAY['health', 'dental', 'checkup']::text[],
    NOW(), NOW()
  );

  -- =====================================================
  -- EXTRACURRICULAR
  -- =====================================================

  -- Child 1: Chess Club - Recurring Weekly (Wednesdays 3:00 PM - 4:00 PM)
  INSERT INTO events (
    family_id, child_id, title, description, event_type,
    start_ts, end_ts, status, source, minutes, location, mode, instructor, tags,
    recurrence_rule, created_at, updated_at
  ) VALUES (
    v_family_id, v_child_1, 'Chess Club',
    'Weekly chess club meeting with strategy lessons and practice games',
    'Extracurricular',
    '2026-01-01 15:00:00-05', '2026-01-01 16:00:00-05',
    'scheduled', 'manual', 60, 'Community Center', 'in-person', 'Mr. Patterson',
    ARRAY['chess', 'strategy', 'club']::text[],
    '{"frequency": "WEEKLY", "interval": 1, "until": "2026-01-27"}'::jsonb,
    NOW(), NOW()
  );

  -- =====================================================
  -- TRIP
  -- =====================================================

  -- All-day Trip: Museum Visit (Jan 13, all day)
  INSERT INTO events (
    family_id, child_ids, title, description, event_type,
    start_ts, end_ts, status, source, minutes, location, mode, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, ARRAY[v_child_1, v_child_2, v_child_3], 'Family Museum Trip',
    'Visiting the Natural History Museum to see dinosaur exhibits and planetarium show',
    'Trip',
    '2026-01-13 09:00:00-05', '2026-01-13 17:00:00-05',
    'scheduled', 'manual', 480, 'Natural History Museum', 'outdoor',
    ARRAY['museum', 'family', 'field-trip']::text[],
    NOW(), NOW()
  );

  -- =====================================================
  -- HOLIDAY
  -- =====================================================

  -- All-day Holiday: New Year's Day (Jan 1, all day)
  INSERT INTO events (
    family_id, child_ids, title, description, event_type,
    start_ts, end_ts, status, source, minutes, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, ARRAY[v_child_1, v_child_2, v_child_3], 'New Year''s Day',
    'Holiday - No school activities scheduled',
    'Holiday',
    '2026-01-01 00:00:00-05', '2026-01-01 23:59:59-05',
    'scheduled', 'manual', 1440,
    ARRAY['holiday', 'new-year']::text[],
    NOW(), NOW()
  );

  -- =====================================================
  -- PROJECT
  -- =====================================================

  -- Child 2: Science Fair Project - Multi-day project (Jan 14-17, afternoons)
  INSERT INTO events (
    family_id, child_id, title, description, event_type, subject_id, unit,
    start_ts, end_ts, status, source, minutes, location, mode, grade, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_2, 'Science Fair Project: Volcano Experiment',
    'Building and testing a volcano model for the school science fair',
    'Project', v_subject_science, 'Unit 7: Earth Science',
    '2026-01-14 13:00:00-05', '2026-01-14 16:00:00-05',
    'scheduled', 'manual', 180, 'Garage Workshop', 'in-person', '5th',
    ARRAY['science', 'project', 'experiment']::text[],
    NOW(), NOW()
  );

  INSERT INTO events (
    family_id, child_id, title, description, event_type, subject_id, unit,
    start_ts, end_ts, status, source, minutes, location, mode, grade, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_2, 'Science Fair Project: Documentation',
    'Writing up the experiment results and creating presentation board',
    'Project', v_subject_science, 'Unit 7: Earth Science',
    '2026-01-16 14:00:00-05', '2026-01-16 17:00:00-05',
    'scheduled', 'manual', 180, 'Study Room', 'in-person', '5th',
    ARRAY['science', 'project', 'writing']::text[],
    NOW(), NOW()
  );

  -- =====================================================
  -- ASSESSMENT
  -- =====================================================

  -- Child 1: Math Assessment - Fractions Test (Jan 20, 10:00 AM - 11:30 AM)
  INSERT INTO events (
    family_id, child_id, title, description, event_type, subject_id, unit,
    start_ts, end_ts, status, source, minutes, location, mode, grade, tags, is_flexible,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_1, 'Math Assessment: Fractions Unit Test',
    'Comprehensive assessment covering fraction operations and problem-solving',
    'Assessment', v_subject_math, 'Unit 3: Fractions',
    '2026-01-20 10:00:00-05', '2026-01-20 11:30:00-05',
    'scheduled', 'manual', 90, 'Home Classroom', 'in-person', '4th',
    ARRAY['math', 'assessment', 'test']::text[], false,
    NOW(), NOW()
  );

  -- =====================================================
  -- HOMEWORK (1 per child)
  -- =====================================================

  -- Child 1: Math Homework - Fraction Worksheets (Due Jan 5)
  INSERT INTO events (
    family_id, child_id, title, description, event_type, subject_id, unit,
    start_ts, end_ts, status, source, minutes, location, mode, is_flexible, grade, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_1, 'Homework: Fraction Practice Worksheets',
    'Complete pages 45-48 in math workbook, due before next lesson',
    'Homework', v_subject_math, 'Unit 3: Fractions',
    '2026-01-04 16:00:00-05', '2026-01-04 17:00:00-05',
    'scheduled', 'manual', 60, 'Home', 'in-person', true, '4th',
    ARRAY['homework', 'math', 'fractions']::text[],
    NOW(), NOW()
  );

  -- Child 2: ELA Homework - Reading Response (Due Jan 6)
  INSERT INTO events (
    family_id, child_id, title, description, event_type, subject_id, unit,
    start_ts, end_ts, status, source, minutes, location, mode, is_flexible, grade, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_2, 'Homework: Reading Response Journal',
    'Write a one-page response to the assigned reading chapter',
    'Homework', v_subject_ela, 'Unit 4: Reading Strategies',
    '2026-01-05 17:00:00-05', '2026-01-05 18:00:00-05',
    'scheduled', 'manual', 60, 'Home', 'in-person', true, '5th',
    ARRAY['homework', 'ela', 'reading']::text[],
    NOW(), NOW()
  );

  -- Child 3: Science Homework - Plant Observation Log (Due Jan 7)
  INSERT INTO events (
    family_id, child_id, title, description, event_type, subject_id, unit,
    start_ts, end_ts, status, source, minutes, location, mode, is_flexible, grade, tags,
    created_at, updated_at
  ) VALUES (
    v_family_id, v_child_3, 'Homework: Plant Observation Log Entry',
    'Document daily changes in plant growth with sketches and notes',
    'Homework', v_subject_science, 'Unit 5: Biology Basics',
    '2026-01-06 15:00:00-05', '2026-01-06 16:00:00-05',
    'scheduled', 'manual', 60, 'Home', 'in-person', true, '3rd',
    ARRAY['homework', 'science', 'observation']::text[],
    NOW(), NOW()
  );

  RAISE NOTICE 'Seed data inserted successfully for Dec 27, 2025 - Jan 27, 2026';
  RAISE NOTICE 'Created: 6 lessons, 6 activities, 1 sport (recurring), 1 appointment, 1 extracurricular (recurring), 1 trip, 1 holiday, 2 project sessions, 1 assessment, 3 homework';
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error inserting seed data: %', SQLERRM;
    RAISE;
END $$;

