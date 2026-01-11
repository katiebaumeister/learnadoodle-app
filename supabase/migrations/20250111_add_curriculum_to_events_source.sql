-- Add 'curriculum' to allowed source values for events table
-- This allows events created from curriculum builder to be stored

-- Drop the existing constraint
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_source_check;

-- Add new constraint with 'curriculum' included
ALTER TABLE events
  ADD CONSTRAINT events_source_check 
  CHECK (source IN ('ai', 'manual', 'year_plan_seed', 'curriculum'));

-- Update comment for documentation
COMMENT ON COLUMN events.source IS 'Source of event creation: ai, manual, year_plan_seed, or curriculum';

