-- Drop the events no-overlap exclusion constraint.
-- Plan My Year and create/edit/drag conflict handling are simplified;
-- overlap detection remains in the UI (create, edit, drag-drop banner) only.
-- ============================================================

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_no_overlap_exclude;
