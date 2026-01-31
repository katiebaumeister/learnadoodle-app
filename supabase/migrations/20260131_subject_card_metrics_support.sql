-- Migration: Support for subject card metrics calculations
-- This migration ensures all necessary columns and indexes exist for efficient subject card metric calculations
-- No new columns are needed - we use existing tables: events, attendance_records, subject, syllabus_sections

-- Verify required columns exist (these should already exist from previous migrations)
DO $$
BEGIN
  -- Verify subject.summary exists (added in 20260131_add_subject_summary.sql)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subject' AND column_name = 'summary'
  ) THEN
    RAISE EXCEPTION 'subject.summary column is required. Please run 20260131_add_subject_summary.sql first.';
  END IF;

  -- Verify events table has required columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'status'
  ) THEN
    RAISE EXCEPTION 'events.status column is required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'subject_id'
  ) THEN
    RAISE EXCEPTION 'events.subject_id column is required.';
  END IF;

  -- Verify attendance_records table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'attendance_records'
  ) THEN
    RAISE EXCEPTION 'attendance_records table is required.';
  END IF;

  RAISE NOTICE 'All required columns and tables exist for subject card metrics.';
END $$;

-- Create indexes for performance (if they don't exist)
-- Index for filtering events by subject and status
CREATE INDEX IF NOT EXISTS idx_events_subject_status 
ON events(subject_id, status) 
WHERE deleted_at IS NULL AND canceled_at IS NULL;

-- Index for filtering events by subject and due date (for upcoming/overdue queries)
CREATE INDEX IF NOT EXISTS idx_events_subject_due_ts 
ON events(subject_id, due_ts) 
WHERE deleted_at IS NULL AND canceled_at IS NULL;

-- Index for attendance_records by event_id (for joining with events)
CREATE INDEX IF NOT EXISTS idx_attendance_records_event_id 
ON attendance_records(event_id);

-- Index for attendance_records by day_date (for this week calculations)
CREATE INDEX IF NOT EXISTS idx_attendance_records_day_date 
ON attendance_records(day_date);

-- Composite index for attendance_records queries (event_id + day_date)
CREATE INDEX IF NOT EXISTS idx_attendance_records_event_date 
ON attendance_records(event_id, day_date);

-- Index for syllabus_sections by suggested_due_ts (for milestone progress)
CREATE INDEX IF NOT EXISTS idx_syllabus_sections_due_ts 
ON syllabus_sections(syllabus_id, suggested_due_ts) 
WHERE suggested_due_ts IS NOT NULL;

COMMENT ON INDEX idx_events_subject_status IS 'Optimizes subject card status calculations (not_started, needs_attention, on_track)';
COMMENT ON INDEX idx_events_subject_due_ts IS 'Optimizes upcoming/overdue item queries for subject cards';
COMMENT ON INDEX idx_attendance_records_event_date IS 'Optimizes this week minutes calculations for subject cards';
COMMENT ON INDEX idx_syllabus_sections_due_ts IS 'Optimizes progress percent calculations from syllabus milestones';
