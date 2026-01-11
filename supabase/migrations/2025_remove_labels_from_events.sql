-- =====================================================
-- Remove Labels/Tags from Events
-- Make tags column nullable and optional (no longer used in UI)
-- =====================================================

-- Make tags column nullable (it's already optional, but ensure it can be NULL)
ALTER TABLE events
  ALTER COLUMN tags DROP NOT NULL;

-- Update comment to indicate tags are deprecated
COMMENT ON COLUMN events.tags IS 'Deprecated: Tags/labels are no longer used in the UI. This column is kept for backward compatibility but should not be used for new events.';

-- Note: We're not dropping the column to avoid breaking existing data
-- The column will simply not be used going forward






