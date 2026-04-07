-- Ensure the events EXCLUDE overlap constraint is dropped on databases that never applied
-- 20260303_drop_events_no_overlap_constraint.sql (e.g. restored snapshots, partial migrates).
-- Block-aware plan apply (block_regenerator) inserts many Lesson rows; the old constraint
-- caused "overlap-safe fallback also failed" and apply_to_calendar to report inserted=0.

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_no_overlap_exclude;
