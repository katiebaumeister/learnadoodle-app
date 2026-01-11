-- Add modality column to events table
-- This stores the learning modality (reading, video, hands_on, discussion, practice, quiz, project)
-- Matching the modality values from curriculum_lessons

DO $$
BEGIN
  -- Add modality column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'modality'
  ) THEN
    ALTER TABLE events ADD COLUMN modality TEXT CHECK (modality IN ('reading', 'video', 'hands_on', 'discussion', 'practice', 'quiz', 'project'));
    
    -- Add index for filtering by modality
    CREATE INDEX IF NOT EXISTS idx_events_modality ON events(modality) WHERE modality IS NOT NULL;
    
    -- Add comment
    COMMENT ON COLUMN events.modality IS 'Learning modality: reading, video, hands_on, discussion, practice, quiz, project';
  END IF;
END $$;

