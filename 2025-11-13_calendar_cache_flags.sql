-- Migration: Add is_frozen and is_shiftable columns to calendar_days_cache
-- Part of Phase 1 - Year-Round Intelligence Core

-- Add columns if they don't exist
ALTER TABLE calendar_days_cache
  ADD COLUMN IF NOT EXISTS is_frozen boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_shiftable boolean DEFAULT true;

-- Create index for frozen days queries
CREATE INDEX IF NOT EXISTS idx_calendar_cache_frozen ON calendar_days_cache(is_frozen) WHERE is_frozen = true;
CREATE INDEX IF NOT EXISTS idx_calendar_cache_shiftable ON calendar_days_cache(is_shiftable) WHERE is_shiftable = false;

