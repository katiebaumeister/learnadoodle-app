-- Migration: Add child_id column to subject table
-- This allows subjects to be linked to specific children for filtering

-- Add child_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subject' AND column_name = 'child_id'
  ) THEN
    ALTER TABLE subject ADD COLUMN child_id UUID REFERENCES children(id) ON DELETE CASCADE;
    
    -- Add index for performance
    CREATE INDEX IF NOT EXISTS idx_subject_child_id ON subject(child_id);
    
    -- Add index for filtering by family and child
    CREATE INDEX IF NOT EXISTS idx_subject_family_child ON subject(family_id, child_id);
    
    RAISE NOTICE 'Added child_id column to subject table';
  ELSE
    RAISE NOTICE 'child_id column already exists in subject table';
  END IF;
END $$;

-- Also check for student_id column (legacy name) and migrate data if needed
DO $$
BEGIN
  -- If student_id exists but child_id doesn't, copy data
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subject' AND column_name = 'student_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subject' AND column_name = 'child_id'
  ) THEN
    -- Copy data from student_id to child_id where child_id is null
    UPDATE subject 
    SET child_id = student_id 
    WHERE child_id IS NULL AND student_id IS NOT NULL;
    
    RAISE NOTICE 'Migrated data from student_id to child_id';
  END IF;
END $$;

