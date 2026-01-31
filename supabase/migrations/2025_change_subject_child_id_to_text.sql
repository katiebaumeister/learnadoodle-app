-- Migration: Change subject.child_id from UUID to TEXT to support semicolon-separated child IDs
-- Format: "child1;child2;child3" for multiple children, or empty string for all children

-- Step 1: Drop foreign key constraint and index (if they exist)
DO $$
BEGIN
  -- Drop foreign key constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'subject_child_id_fkey' 
    AND table_name = 'subject'
  ) THEN
    ALTER TABLE subject DROP CONSTRAINT subject_child_id_fkey;
    RAISE NOTICE 'Dropped foreign key constraint on child_id';
  END IF;
END $$;

-- Drop the index (will recreate later)
DROP INDEX IF EXISTS idx_subject_child_id;
DROP INDEX IF EXISTS idx_subject_family_child;

-- Step 2: Add a temporary text column
ALTER TABLE subject ADD COLUMN IF NOT EXISTS child_id_temp TEXT;

-- Step 3: Migrate existing data to temporary column
-- Convert single child_id UUID to text format
UPDATE subject 
SET child_id_temp = child_id::text 
WHERE child_id IS NOT NULL;

-- Convert NULL child_id (family-wide) to empty string
UPDATE subject 
SET child_id_temp = '' 
WHERE child_id IS NULL;

-- Step 4: Drop the old UUID column
ALTER TABLE subject DROP COLUMN IF EXISTS child_id;

-- Step 5: Rename the temporary column to child_id
ALTER TABLE subject RENAME COLUMN child_id_temp TO child_id;

-- Step 6: Set default value
ALTER TABLE subject ALTER COLUMN child_id SET DEFAULT '';

-- Step 7: Recreate indexes (for TEXT column)
CREATE INDEX IF NOT EXISTS idx_subject_child_id ON subject(child_id);
CREATE INDEX IF NOT EXISTS idx_subject_family_child ON subject(family_id, child_id);

-- Step 8: Add comment
COMMENT ON COLUMN subject.child_id IS 'Semicolon-separated list of child IDs (e.g., "child1;child2;child3"). Empty string means applies to all children.';
