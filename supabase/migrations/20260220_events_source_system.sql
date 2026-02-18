-- Allow source = 'system' for plan year placeholders (apply_to_calendar)
-- Fixes: events_source_check violation (23514)
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_source_check;

ALTER TABLE events
  ADD CONSTRAINT events_source_check
  CHECK (source IN ('ai', 'manual', 'year_plan_seed', 'curriculum', 'system'));

COMMENT ON COLUMN events.source IS 'Source of event creation: ai, manual, year_plan_seed, curriculum, or system';
