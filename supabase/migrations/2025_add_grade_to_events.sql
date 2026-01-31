-- Migration: Add grade column to events table
-- This allows storing grades directly on events (assignments, assessments, etc.)
-- Grades can be in various formats: letter grades (A, B+, etc.), percentages (95%), or numeric scores

-- Step 1: Add the column to events table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'grade'
  ) THEN
    ALTER TABLE events ADD COLUMN grade TEXT;
    
    -- Add index for filtering events with grades
    CREATE INDEX IF NOT EXISTS idx_events_grade ON events(subject_id, grade) WHERE grade IS NOT NULL;
    
    -- Add comment
    COMMENT ON COLUMN events.grade IS 'Grade for this event (optional). Can be letter grade (A, B+, etc.), percentage (95%), or numeric score. Used for gradebook calculations and semester/class grade calculations.';
    RAISE NOTICE 'Added grade column to events table';
  ELSE
    RAISE NOTICE 'grade column already exists';
  END IF;
END $$;
