-- Add columns to events table for curriculum and reference date tracking
-- This allows us to use events table for everything instead of curriculum_units/curriculum_lessons

ALTER TABLE events
ADD COLUMN IF NOT EXISTS is_reference_date BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_curriculum_related BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS curriculum_unit_title TEXT,
ADD COLUMN IF NOT EXISTS curriculum_lesson_sequence INTEGER,
ADD COLUMN IF NOT EXISTS curriculum_metadata JSONB DEFAULT '{}';

-- Add index for curriculum-related queries
CREATE INDEX IF NOT EXISTS idx_events_curriculum_related ON events(is_curriculum_related) WHERE is_curriculum_related = TRUE;
CREATE INDEX IF NOT EXISTS idx_events_reference_date ON events(is_reference_date) WHERE is_reference_date = TRUE;
CREATE INDEX IF NOT EXISTS idx_events_curriculum_unit_title ON events(curriculum_unit_title) WHERE curriculum_unit_title IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN events.is_reference_date IS 'True if this event represents a reference date from a syllabus (not an actual scheduled event)';
COMMENT ON COLUMN events.is_curriculum_related IS 'True if this event is related to curriculum structure (units/lessons)';
COMMENT ON COLUMN events.curriculum_unit_title IS 'Title of the curriculum unit this event belongs to';
COMMENT ON COLUMN events.curriculum_lesson_sequence IS 'Sequence index of the lesson within the unit';
COMMENT ON COLUMN events.curriculum_metadata IS 'Additional curriculum metadata (lesson type, duration, etc.)';
