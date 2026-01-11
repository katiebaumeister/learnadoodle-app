-- Add is_backlog field to events table
-- This properly marks backlog items instead of using far-future dates

-- Add is_backlog column
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_backlog boolean DEFAULT false;

-- Create index for backlog queries
CREATE INDEX IF NOT EXISTS idx_events_is_backlog ON events(is_backlog) WHERE is_backlog = true;

-- Update existing backlog items (those with dates >= 2099 and is_flexible=true)
UPDATE events
SET is_backlog = true
WHERE EXTRACT(YEAR FROM start_ts) >= 2099
  AND is_flexible = true
  AND (is_backlog IS NULL OR is_backlog = false);

-- Add comment
COMMENT ON COLUMN events.is_backlog IS 'Marks events as backlog items that are not yet scheduled on the calendar';
