-- Allow curriculum_units.source_type 'ai_generated' for Generate Curriculum from scratch
ALTER TABLE curriculum_units
  DROP CONSTRAINT IF EXISTS curriculum_units_source_type_check;

ALTER TABLE curriculum_units
  ADD CONSTRAINT curriculum_units_source_type_check
  CHECK (source_type IN ('topic', 'syllabus', 'pdf', 'link', 'material', 'ai_generated'));

COMMENT ON COLUMN curriculum_units.source_type IS 'Origin: topic, syllabus, pdf, link, material, or ai_generated (Generate Curriculum from scratch).';
