-- Notes Table Migration
-- Creates notes table for storing learning notes, observations, and reflections
-- Safe to run multiple times (IF NOT EXISTS guards)

-- ============================================================
-- 1. Create notes table
-- ============================================================

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subject(id),
  text text NOT NULL,
  type text NOT NULL DEFAULT 'log' CHECK (type IN ('log', 'observation', 'reflection', 'milestone', 'concern', 'celebration')),
  tags text[] DEFAULT '{}'::text[],
  linked_evidence_id uuid REFERENCES uploads(id),
  linked_event_id uuid REFERENCES events(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Indexes for notes
CREATE INDEX IF NOT EXISTS notes_family_idx ON notes(family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notes_child_idx ON notes(child_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notes_subject_idx ON notes(subject_id, created_at DESC) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notes_type_idx ON notes(type);
CREATE INDEX IF NOT EXISTS notes_tags_idx ON notes USING GIN(tags);

-- Enable RLS
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- RLS policies using existing is_family_member helper
DROP POLICY IF EXISTS family_read_own_notes ON notes;
CREATE POLICY family_read_own_notes
ON notes
FOR SELECT
USING (is_family_member(family_id));

DROP POLICY IF EXISTS family_insert_own_notes ON notes;
CREATE POLICY family_insert_own_notes
ON notes
FOR INSERT
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_update_own_notes ON notes;
CREATE POLICY family_update_own_notes
ON notes
FOR UPDATE
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));

DROP POLICY IF EXISTS family_delete_own_notes ON notes;
CREATE POLICY family_delete_own_notes
ON notes
FOR DELETE
USING (is_family_member(family_id));

-- Grant permissions to service_role and authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON notes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON notes TO authenticated;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notes_updated_at_trigger ON notes;
CREATE TRIGGER notes_updated_at_trigger
BEFORE UPDATE ON notes
FOR EACH ROW
EXECUTE FUNCTION update_notes_updated_at();

