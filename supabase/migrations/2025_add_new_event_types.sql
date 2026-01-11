-- =====================================================
-- Add New Event Types: Trip, Holiday, Project, Exam, Homework
-- =====================================================

-- Step 1: Drop the existing constraint
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;

-- Step 2: Add new constraint with all UI event types
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
    'Exam',
    'Homework',
    'Other'
  ));

-- Step 3: Update comment for documentation
COMMENT ON COLUMN events.event_type IS 'Event type matching UI filter values: Lesson, Activity, Assignment, Sport, Appointment, Extracurricular, Trip, Holiday, Project, Exam, Homework, Other (required, defaults to Other)';

-- Verification
DO $$
BEGIN
  RAISE NOTICE '╔════════════════════════════════════════╗';
  RAISE NOTICE '║  NEW EVENT TYPES ADDED                  ║';
  RAISE NOTICE '╚════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Event types now include:';
  RAISE NOTICE '  Lesson, Activity, Assignment, Sport, Appointment, Extracurricular';
  RAISE NOTICE '  Trip, Holiday, Project, Exam, Homework, Other';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Database constraint updated to include all UI event types';
END$$;

