-- Template Marketplace Migration
-- Adds cross-family template sharing support

-- ============================================================================
-- 1. Add sharing fields to lesson_templates
-- ============================================================================

-- Public sharing flag
ALTER TABLE lesson_templates 
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false NOT NULL;

-- Marketplace metadata
ALTER TABLE lesson_templates 
ADD COLUMN IF NOT EXISTS marketplace_description TEXT;
ALTER TABLE lesson_templates 
ADD COLUMN IF NOT EXISTS marketplace_tags TEXT[] DEFAULT '{}'::text[];
ALTER TABLE lesson_templates 
ADD COLUMN IF NOT EXISTS marketplace_rating NUMERIC(3,2) DEFAULT NULL;
ALTER TABLE lesson_templates 
ADD COLUMN IF NOT EXISTS marketplace_usage_count INTEGER DEFAULT 0;

-- ============================================================================
-- 2. Create template_shares table for tracking shares
-- ============================================================================

CREATE TABLE IF NOT EXISTS template_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES lesson_templates(id) ON DELETE CASCADE,
  shared_by_family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  shared_to_family_id UUID REFERENCES family(id) ON DELETE CASCADE, -- NULL if public
  copied_at TIMESTAMPTZ DEFAULT NOW(),
  copied_by UUID REFERENCES auth.users(id),
  UNIQUE(template_id, shared_to_family_id)
);

CREATE INDEX IF NOT EXISTS idx_template_shares_template ON template_shares(template_id);
CREATE INDEX IF NOT EXISTS idx_template_shares_shared_by ON template_shares(shared_by_family_id);
CREATE INDEX IF NOT EXISTS idx_template_shares_shared_to ON template_shares(shared_to_family_id);

-- RLS for template_shares
ALTER TABLE template_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "template_shares_select" ON template_shares 
  FOR SELECT 
  TO authenticated
  USING (
    is_family_member(shared_by_family_id) OR 
    is_family_member(shared_to_family_id) OR
    shared_to_family_id IS NULL
  );

CREATE POLICY "template_shares_insert" ON template_shares 
  FOR INSERT 
  TO authenticated
  WITH CHECK (is_family_member(shared_by_family_id));

-- ============================================================================
-- 3. Update RLS for lesson_templates to allow viewing public templates
-- ============================================================================

-- Allow viewing public templates
DROP POLICY IF EXISTS "lesson_templates_select_public" ON lesson_templates;
CREATE POLICY "lesson_templates_select_public" ON lesson_templates 
  FOR SELECT 
  TO authenticated
  USING (is_public = true OR is_family_member(family_id));

-- ============================================================================
-- 4. Function to copy a shared template to a family
-- ============================================================================

CREATE OR REPLACE FUNCTION copy_shared_template(
  p_template_id UUID,
  p_target_family_id UUID,
  p_copied_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_template_id UUID;
  v_source_template RECORD;
BEGIN
  -- Get source template (must be public or shared to this family)
  SELECT * INTO v_source_template
  FROM lesson_templates
  WHERE id = p_template_id
    AND (is_public = true OR family_id = p_target_family_id);
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found or not accessible';
  END IF;
  
  -- Create copy for target family
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
    grade_levels,
    pacing,
    adaptation_rules,
    created_by,
    is_public,
    marketplace_description,
    marketplace_tags
  )
  VALUES (
    p_target_family_id,
    v_source_template.title,
    NULL, -- Subject ID is family-specific, so set to NULL
    v_source_template.default_objectives,
    v_source_template.default_materials,
    v_source_template.default_steps,
    v_source_template.default_duration,
    v_source_template.default_rich_text,
    v_source_template.linked_standards,
    v_source_template.grade_levels,
    v_source_template.pacing,
    v_source_template.adaptation_rules,
    p_copied_by,
    false, -- Copied templates are private by default
    NULL, -- Clear marketplace fields
    '{}'::text[]
  )
  RETURNING id INTO v_new_template_id;
  
  -- Record the share
  INSERT INTO template_shares (
    template_id,
    shared_by_family_id,
    shared_to_family_id,
    copied_by
  )
  VALUES (
    p_template_id,
    v_source_template.family_id,
    p_target_family_id,
    p_copied_by
  )
  ON CONFLICT (template_id, shared_to_family_id) DO NOTHING;
  
  -- Increment usage count
  UPDATE lesson_templates
  SET marketplace_usage_count = marketplace_usage_count + 1
  WHERE id = p_template_id;
  
  RETURN v_new_template_id;
END;
$$;

-- ============================================================================
-- 5. Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION copy_shared_template TO authenticated;
GRANT SELECT, INSERT ON template_shares TO authenticated;

-- ============================================================================
-- 6. Add comments
-- ============================================================================

COMMENT ON COLUMN lesson_templates.is_public IS 'True if this template is shared publicly in the marketplace';
COMMENT ON COLUMN lesson_templates.marketplace_description IS 'Description for marketplace listing';
COMMENT ON COLUMN lesson_templates.marketplace_tags IS 'Tags for marketplace search';
COMMENT ON COLUMN lesson_templates.marketplace_rating IS 'Average rating from users';
COMMENT ON COLUMN lesson_templates.marketplace_usage_count IS 'Number of times this template has been copied';

