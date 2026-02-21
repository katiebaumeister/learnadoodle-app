-- Allow one attendance record per (event, child) so whole-family events can have
-- one record per family child (e.g. Lilly, Max, Enzo) instead of a single row.
-- Drop one-per-event unique; add (event_id, child_id) unique constraint so
-- ON CONFLICT (event_id, child_id) is valid.

DROP INDEX IF EXISTS attendance_records_event_unique;
-- If previous migration version created a unique index (not constraint), drop it so we can add the constraint
DROP INDEX IF EXISTS attendance_records_event_child_unique;

ALTER TABLE attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_event_child_unique;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_event_child_unique UNIQUE (event_id, child_id);

COMMENT ON CONSTRAINT attendance_records_event_child_unique ON attendance_records IS
  'One attendance record per event per child; whole-family events get one row per family child.';
