-- Plain-text import source: store pasted syllabus/outline for extraction (Import & extract flow).
-- Separate from syllabi (which ties to uploads); this is for paste-only imports.
CREATE TABLE IF NOT EXISTS syllabus_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  source_title TEXT,
  source_type TEXT,
  raw_text TEXT NOT NULL,
  parse_mode TEXT,
  parse_status TEXT NOT NULL DEFAULT 'parsed',
  parser_metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_syllabus_imports_family ON syllabus_imports(family_id);
CREATE INDEX IF NOT EXISTS idx_syllabus_imports_subject ON syllabus_imports(subject_id);

COMMENT ON TABLE syllabus_imports IS 'Raw pasted text from Import & extract; preserved for traceability. Canonical curriculum_units/curriculum_lessons reference via source_ref.';

-- Allow curriculum_units.source_type 'plain_text_parsed' for Import & extract
ALTER TABLE curriculum_units
  DROP CONSTRAINT IF EXISTS curriculum_units_source_type_check;

ALTER TABLE curriculum_units
  ADD CONSTRAINT curriculum_units_source_type_check
  CHECK (source_type IN ('topic', 'syllabus', 'pdf', 'link', 'material', 'ai_generated', 'plain_text_parsed'));

COMMENT ON COLUMN curriculum_units.source_type IS 'Origin: topic, syllabus, pdf, link, material, ai_generated, or plain_text_parsed (Import & extract).';

-- RLS
ALTER TABLE syllabus_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS syllabus_imports_select ON syllabus_imports;
DROP POLICY IF EXISTS syllabus_imports_insert ON syllabus_imports;
DROP POLICY IF EXISTS syllabus_imports_update ON syllabus_imports;
DROP POLICY IF EXISTS syllabus_imports_delete ON syllabus_imports;

CREATE POLICY syllabus_imports_select ON syllabus_imports
  FOR SELECT USING (is_family_member(family_id));
CREATE POLICY syllabus_imports_insert ON syllabus_imports
  FOR INSERT WITH CHECK (is_family_member(family_id));
CREATE POLICY syllabus_imports_update ON syllabus_imports
  FOR UPDATE USING (is_family_member(family_id)) WITH CHECK (is_family_member(family_id));
CREATE POLICY syllabus_imports_delete ON syllabus_imports
  FOR DELETE USING (is_family_member(family_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON syllabus_imports TO service_role;
