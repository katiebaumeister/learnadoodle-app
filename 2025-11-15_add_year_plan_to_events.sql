-- Migration: Add year_plan_id to events table and update source constraint
-- Part of Phase 1 - Year-Round Intelligence Core

-- Add year_plan_id column to events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS year_plan_id uuid REFERENCES year_plans(id) ON DELETE SET NULL;

-- Create index for year plan queries
CREATE INDEX IF NOT EXISTS idx_events_year_plan_id ON events(year_plan_id) WHERE year_plan_id IS NOT NULL;

-- First, update any existing rows with invalid source values to 'manual'
-- This handles cases where source might be NULL or have other values
UPDATE events
SET source = 'manual'
WHERE source IS NULL 
   OR source NOT IN ('ai', 'manual', 'year_plan_seed');

-- Update source constraint to include 'year_plan_seed'
-- First, drop the existing constraint if it exists
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_source_check;

-- Add new constraint with 'year_plan_seed' option
ALTER TABLE events
  ADD CONSTRAINT events_source_check 
  CHECK (source IN ('ai', 'manual', 'year_plan_seed'));

-- Ensure source has a default value for new rows
ALTER TABLE events
  ALTER COLUMN source SET DEFAULT 'manual';

-- Add comment
COMMENT ON COLUMN events.year_plan_id IS 'Links event to a year plan if created via year plan seeding';

