-- Template Versioning Migration
-- Adds versioning support to lesson_templates for multi-version template libraries

-- ============================================================================
-- 1. Add versioning columns to lesson_templates
-- ============================================================================

-- Add version number (starts at 1 for existing templates)
ALTER TABLE lesson_templates 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;

-- Add parent_template_id to track version history
ALTER TABLE lesson_templates 
ADD COLUMN IF NOT EXISTS parent_template_id UUID REFERENCES lesson_templates(id) ON DELETE SET NULL;

-- Add is_current_version flag to mark the active version
ALTER TABLE lesson_templates 
ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN DEFAULT true NOT NULL;

-- Add version_notes to track what changed in each version
ALTER TABLE lesson_templates 
ADD COLUMN IF NOT EXISTS version_notes TEXT;

-- ============================================================================
-- 2. Set defaults for existing templates
-- ============================================================================

-- All existing templates are version 1 and current
UPDATE lesson_templates 
SET version = 1, is_current_version = true 
WHERE version IS NULL OR is_current_version IS NULL;

-- ============================================================================
-- 3. Create indexes for version queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_lesson_templates_parent ON lesson_templates(parent_template_id);
CREATE INDEX IF NOT EXISTS idx_lesson_templates_version ON lesson_templates(version);
CREATE INDEX IF NOT EXISTS idx_lesson_templates_current ON lesson_templates(is_current_version) WHERE is_current_version = true;

-- ============================================================================
-- 4. Function to create a new version of a template
-- ============================================================================

CREATE OR REPLACE FUNCTION create_template_version(
  p_template_id UUID,
  p_version_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_template_id UUID;
  v_parent_template_id UUID;
  v_next_version INTEGER;
BEGIN
  -- Get the original template (find root parent if this is already a version)
  SELECT 
    COALESCE(parent_template_id, id),
    COALESCE(parent_template_id, id)
  INTO v_parent_template_id, v_parent_template_id
  FROM lesson_templates
  WHERE id = p_template_id;
  
  -- If no parent, use the template itself as parent
  IF v_parent_template_id IS NULL THEN
    v_parent_template_id := p_template_id;
  END IF;
  
  -- Get the next version number
  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_next_version
  FROM lesson_templates
  WHERE parent_template_id = v_parent_template_id OR (parent_template_id IS NULL AND id = v_parent_template_id);
  
  -- Mark all previous versions as not current
  UPDATE lesson_templates
  SET is_current_version = false
  WHERE (parent_template_id = v_parent_template_id OR (parent_template_id IS NULL AND id = v_parent_template_id))
    AND is_current_version = true;
  
  -- Create new version by copying the template
  INSERT INTO lesson_templates (
    family_id,
    title,
    subject_id,
    default_objectives,
    default_materials,
    default_steps,
    default_duration,
    default_rich_text,
    linked_standards,
    created_by,
    parent_template_id,
    version,
    is_current_version,
    version_notes
  )
  SELECT 
    family_id,
    title,
    subject_id,
    default_objectives,
    default_materials,
    default_steps,
    default_duration,
    default_rich_text,
    linked_standards,
    created_by,
    v_parent_template_id,
    v_next_version,
    true,
    p_version_notes
  FROM lesson_templates
  WHERE id = p_template_id
  RETURNING id INTO v_new_template_id;
  
  RETURN v_new_template_id;
END;
$$;

-- ============================================================================
-- 5. Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION create_template_version TO authenticated;

-- ============================================================================
-- 6. Add comment
-- ============================================================================

COMMENT ON COLUMN lesson_templates.version IS 'Version number of this template (1-based)';
COMMENT ON COLUMN lesson_templates.parent_template_id IS 'Reference to the original template (for version tracking)';
COMMENT ON COLUMN lesson_templates.is_current_version IS 'True if this is the current/active version';
COMMENT ON COLUMN lesson_templates.version_notes IS 'Notes about what changed in this version';

