-- Migration: Sticky Notes
-- Creates table for draggable, positioned sticky notes

CREATE TABLE IF NOT EXISTS sticky_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  position JSONB NOT NULL DEFAULT '{"x": 100, "y": 100}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster family lookups
CREATE INDEX IF NOT EXISTS idx_sticky_notes_family_id ON sticky_notes(family_id);

-- RLS Policies
ALTER TABLE sticky_notes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see sticky notes from their family
CREATE POLICY "Users can view their family's sticky notes"
  ON sticky_notes FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Policy: Users can create sticky notes for their family
CREATE POLICY "Users can create sticky notes for their family"
  ON sticky_notes FOR INSERT
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Policy: Users can update their family's sticky notes
CREATE POLICY "Users can update their family's sticky notes"
  ON sticky_notes FOR UPDATE
  USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Policy: Users can delete their family's sticky notes
CREATE POLICY "Users can delete their family's sticky notes"
  ON sticky_notes FOR DELETE
  USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_sticky_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sticky_notes_updated_at
  BEFORE UPDATE ON sticky_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_sticky_notes_updated_at();

