-- Allow curriculum_units.source_type 'manual' for Add unit manually flow
ALTER TABLE curriculum_units
  DROP CONSTRAINT IF EXISTS curriculum_units_source_type_check;

ALTER TABLE curriculum_units
  ADD CONSTRAINT curriculum_units_source_type_check
  CHECK (source_type IN ('topic', 'syllabus', 'pdf', 'link', 'material', 'ai_generated', 'plain_text_parsed', 'manual'));

COMMENT ON COLUMN curriculum_units.source_type IS 'Origin: topic, syllabus, pdf, link, material, ai_generated, plain_text_parsed, or manual (Add unit manually).';
