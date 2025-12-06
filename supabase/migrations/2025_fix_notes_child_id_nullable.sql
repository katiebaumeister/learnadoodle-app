-- Fix notes table to allow null child_id for family-level notes
-- This migration makes child_id nullable and updates the foreign key constraint

-- Drop the existing NOT NULL constraint on child_id
ALTER TABLE notes 
  ALTER COLUMN child_id DROP NOT NULL;

-- Drop the existing foreign key constraint (if it exists with ON DELETE CASCADE)
-- We need to recreate it to allow NULL values
ALTER TABLE notes 
  DROP CONSTRAINT IF EXISTS notes_child_id_fkey;

-- Recreate the foreign key constraint allowing NULL
ALTER TABLE notes 
  ADD CONSTRAINT notes_child_id_fkey 
  FOREIGN KEY (child_id) 
  REFERENCES children(id) 
  ON DELETE CASCADE;

-- Update the index to handle NULL values properly
-- The existing index should work, but we can add a partial index for non-null values
DROP INDEX IF EXISTS notes_child_idx;
CREATE INDEX IF NOT EXISTS notes_child_idx ON notes(child_id, created_at DESC) WHERE child_id IS NOT NULL;

-- Add a comment explaining the nullable child_id
COMMENT ON COLUMN notes.child_id IS 'Child ID for child-specific notes, NULL for family-level notes';

