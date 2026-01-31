-- Migration: Support for subject detail page metrics calculations
-- This migration ensures all necessary columns exist for subject detail metrics

-- Verify required columns exist
DO $$
BEGIN
  -- Verify subject.summary exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subject' AND column_name = 'summary'
  ) THEN
    RAISE EXCEPTION 'subject.summary column is required. Please run 20260131_add_subject_summary.sql first.';
  END IF;

  RAISE NOTICE 'All required columns exist for subject detail metrics.';
END $$;

-- Add 'possible' column to grades table if it doesn't exist (for score/possible calculations)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'grades' AND column_name = 'possible'
  ) THEN
    ALTER TABLE grades ADD COLUMN possible NUMERIC;
    
    COMMENT ON COLUMN grades.possible IS 'Maximum possible points/score for this grade (used for percentage calculations: score/possible)';
    
    RAISE NOTICE 'Added possible column to grades table';
  ELSE
    RAISE NOTICE 'possible column already exists in grades table';
  END IF;
END $$;

-- Add indexes for performance
-- Index for filtering attendance by date range (last 30 days)
CREATE INDEX IF NOT EXISTS idx_attendance_records_day_date_range 
ON attendance_records(day_date DESC) 
WHERE day_date >= CURRENT_DATE - INTERVAL '30 days';

-- Index for filtering grades by subject and date (for average calculation)
CREATE INDEX IF NOT EXISTS idx_grades_subject_created 
ON grades(subject_id, created_at DESC);

-- Index for filtering compliance by family and status
CREATE INDEX IF NOT EXISTS idx_compliance_family_status 
ON family_compliance_checklist(family_id, status);

COMMENT ON INDEX idx_attendance_records_day_date_range IS 'Optimizes last 30 days attendance queries for subject detail page';
COMMENT ON INDEX idx_grades_subject_created IS 'Optimizes grade average calculations for subject detail page';
COMMENT ON INDEX idx_compliance_family_status IS 'Optimizes compliance ready calculations for subject detail page';
