-- =====================================================
-- Rename Event Type: Exam -> Assessment
-- =====================================================

-- Step 1: Update existing events in the database
UPDATE events
SET event_type = 'Assessment'
WHERE event_type = 'Exam';

-- Step 2: Drop the existing constraint
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;

-- Step 3: Add new constraint with Assessment instead of Exam
ALTER TABLE events
  ADD CONSTRAINT events_event_type_check 
  CHECK (event_type IN (
    'Lesson',
    'Activity', 
    'Assignment',
    'Sport',
    'Appointment',
    'Extracurricular',
    'Trip',
    'Holiday',
    'Project',
    'Assessment',
    'Homework',
    'Other'
  ));

-- Step 4: Update comment for documentation
COMMENT ON COLUMN events.event_type IS 'Event type matching UI filter values: Lesson, Activity, Assignment, Sport, Appointment, Extracurricular, Trip, Holiday, Project, Assessment, Homework, Other (required, defaults to Other)';

-- Verification
DO $$
DECLARE
  v_exam_count INTEGER;
  v_assessment_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_exam_count FROM events WHERE event_type = 'Exam';
  SELECT COUNT(*) INTO v_assessment_count FROM events WHERE event_type = 'Assessment';
  
  RAISE NOTICE '╔════════════════════════════════════════╗';
  RAISE NOTICE '║  RENAMED EXAM TO ASSESSMENT             ║';
  RAISE NOTICE '╚════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Event Type Migration:';
  RAISE NOTICE '  Exam events remaining: %', v_exam_count;
  RAISE NOTICE '  Assessment events: %', v_assessment_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Event types now include:';
  RAISE NOTICE '  Lesson, Activity, Assignment, Sport, Appointment, Extracurricular';
  RAISE NOTICE '  Trip, Holiday, Project, Assessment, Homework, Other';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Database constraint updated: Exam -> Assessment';
  RAISE NOTICE '✅ All existing Exam events renamed to Assessment';
END$$;

