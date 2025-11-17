-- Phase 4 Enhancements
-- 1. Add credits field to grades table
-- 2. Ensure transcripts table can store export metadata

-- Add credits column to grades (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'grades' AND column_name = 'credits'
  ) THEN
    ALTER TABLE grades ADD COLUMN credits numeric DEFAULT 0;
  END IF;
END $$;

-- Add index for faster credit queries
CREATE INDEX IF NOT EXISTS grades_child_credits_idx ON grades(child_id, credits) WHERE credits > 0;

