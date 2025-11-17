-- Phase 3: Smart Content Flow + Browser Extension MVP
-- Chunk A: DB extensions

-- 1) Extend external_courses table
ALTER TABLE external_courses
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS duration_sec integer,
  ADD COLUMN IF NOT EXISTS imported_by uuid REFERENCES profiles(id);

-- Add index for imported_by queries
CREATE INDEX IF NOT EXISTS idx_external_courses_imported_by 
  ON external_courses(imported_by) 
  WHERE imported_by IS NOT NULL;

-- 2) Extend external_units table
ALTER TABLE external_units
  ADD COLUMN IF NOT EXISTS source_url text;

-- 3) Extend external_lessons table
ALTER TABLE external_lessons
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS duration_sec integer;

-- 4) Add flag for events created from extension
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS completed_from_extension boolean NOT NULL DEFAULT false;

-- Add index for completed_from_extension queries
CREATE INDEX IF NOT EXISTS idx_events_completed_from_extension 
  ON events(completed_from_extension) 
  WHERE completed_from_extension = true;

-- Add comments for documentation
COMMENT ON COLUMN external_courses.source_url IS 'Original source URL (e.g., YouTube video/playlist URL)';
COMMENT ON COLUMN external_courses.thumbnail_url IS 'Thumbnail image URL for the course';
COMMENT ON COLUMN external_courses.duration_sec IS 'Total duration in seconds';
COMMENT ON COLUMN external_courses.imported_by IS 'User who imported this course via extension or link';
COMMENT ON COLUMN external_units.source_url IS 'Original source URL for the unit';
COMMENT ON COLUMN external_lessons.source_url IS 'Original source URL (e.g., YouTube video URL)';
COMMENT ON COLUMN external_lessons.thumbnail_url IS 'Thumbnail image URL for the lesson';
COMMENT ON COLUMN external_lessons.duration_sec IS 'Duration in seconds';
COMMENT ON COLUMN events.completed_from_extension IS 'True if this event was marked completed via browser extension';

