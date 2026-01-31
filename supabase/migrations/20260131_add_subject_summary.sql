-- Migration: Add summary column to subject table
-- This adds an optional one-line summary field for subjects

-- Add summary column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subject' AND column_name = 'summary'
  ) THEN
    ALTER TABLE subject ADD COLUMN summary TEXT;
    
    -- Add comment
    COMMENT ON COLUMN subject.summary IS 'Optional one-line summary describing the subject (e.g., "Building foundational knowledge on fractions.")';
    
    RAISE NOTICE 'Added summary column to subject table';
  ELSE
    RAISE NOTICE 'summary column already exists in subject table';
  END IF;
END $$;
