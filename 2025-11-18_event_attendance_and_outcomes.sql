-- Chunk A: Database tables for event completion and outcome reporting
-- Creates attendance_records and event_outcomes tables with RLS

-- 1) attendance_records table
CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  minutes integer NOT NULL,
  status text NOT NULL DEFAULT 'present'
    CHECK (status IN ('present', 'partial', 'absent')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Add unique constraint to prevent duplicate attendance records per event
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_event_unique 
ON attendance_records(event_id);

-- Enable RLS
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- RLS policies using existing is_family_member helper
DROP POLICY IF EXISTS family_read_own_attendance ON attendance_records;
CREATE POLICY family_read_own_attendance
ON attendance_records
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_attendance ON attendance_records;
CREATE POLICY family_insert_own_attendance
ON attendance_records
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_attendance ON attendance_records;
CREATE POLICY family_update_own_attendance
ON attendance_records
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_attendance ON attendance_records;
CREATE POLICY family_delete_own_attendance
ON attendance_records
FOR DELETE
USING (is_family_member(family_id));

-- 2) event_outcomes table
CREATE TABLE IF NOT EXISTS event_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subject(id),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rating smallint CHECK (rating >= 1 AND rating <= 5),
  grade text,
  note text,
  strengths text[] DEFAULT '{}',
  struggles text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Add unique constraint to prevent duplicate outcomes per event
CREATE UNIQUE INDEX IF NOT EXISTS event_outcomes_event_unique 
ON event_outcomes(event_id);

-- Enable RLS
ALTER TABLE event_outcomes ENABLE ROW LEVEL SECURITY;

-- RLS policies using existing is_family_member helper
DROP POLICY IF EXISTS family_read_own_outcomes ON event_outcomes;
CREATE POLICY family_read_own_outcomes
ON event_outcomes
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_outcomes ON event_outcomes;
CREATE POLICY family_insert_own_outcomes
ON event_outcomes
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_outcomes ON event_outcomes;
CREATE POLICY family_update_own_outcomes
ON event_outcomes
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_outcomes ON event_outcomes;
CREATE POLICY family_delete_own_outcomes
ON event_outcomes
FOR DELETE
USING (is_family_member(family_id));

-- Grant permissions to service_role for backend operations
GRANT SELECT, INSERT, UPDATE, DELETE ON attendance_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON event_outcomes TO service_role;

