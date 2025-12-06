-- Smart Templates Migration
-- Adds grade level and pacing adaptation support to lesson_templates

-- ============================================================================
-- 1. Add smart template fields
-- ============================================================================

-- Grade levels this template is designed for (array of grade levels, e.g., ['K', '1', '2'] or ['9', '10'])
ALTER TABLE lesson_templates 
ADD COLUMN IF NOT EXISTS grade_levels TEXT[] DEFAULT NULL;

-- Pacing options: 'fast', 'normal', 'slow', 'flexible'
ALTER TABLE lesson_templates 
ADD COLUMN IF NOT EXISTS pacing TEXT DEFAULT NULL;

-- Adaptation rules (JSONB for flexible configuration)
ALTER TABLE lesson_templates 
ADD COLUMN IF NOT EXISTS adaptation_rules JSONB DEFAULT '{}'::jsonb;

-- ============================================================================
-- 2. Create indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_lesson_templates_grade_levels ON lesson_templates USING GIN(grade_levels);
CREATE INDEX IF NOT EXISTS idx_lesson_templates_pacing ON lesson_templates(pacing);

-- ============================================================================
-- 3. Function to adapt template based on grade level and pacing
-- ============================================================================

CREATE OR REPLACE FUNCTION adapt_template_for_grade_pacing(
  p_template_id UUID,
  p_target_grade TEXT,
  p_target_pacing TEXT DEFAULT 'normal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_template RECORD;
  v_adapted JSONB;
  v_duration_multiplier NUMERIC;
  v_complexity_adjustment TEXT;
BEGIN
  -- Get template
  SELECT * INTO v_template
  FROM lesson_templates
  WHERE id = p_template_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Initialize adapted structure
  v_adapted := jsonb_build_object(
    'title', v_template.title,
    'default_objectives', v_template.default_objectives,
    'default_materials', v_template.default_materials,
    'default_steps', v_template.default_steps,
    'default_duration', v_template.default_duration,
    'default_rich_text', v_template.default_rich_text
  );
  
  -- Calculate duration multiplier based on pacing
  CASE p_target_pacing
    WHEN 'fast' THEN v_duration_multiplier := 0.75;  -- 25% faster
    WHEN 'slow' THEN v_duration_multiplier := 1.5;   -- 50% slower
    WHEN 'flexible' THEN v_duration_multiplier := 1.0;
    ELSE v_duration_multiplier := 1.0;  -- normal
  END CASE;
  
  -- Adjust duration if present
  IF v_template.default_duration IS NOT NULL THEN
    v_adapted := jsonb_set(
      v_adapted,
      '{default_duration}',
      to_jsonb(ROUND(v_template.default_duration * v_duration_multiplier)::INTEGER)
    );
  END IF;
  
  -- Grade level complexity adjustments
  -- Lower grades: simpler language, more hands-on
  -- Higher grades: more abstract, independent work
  IF p_target_grade IN ('K', '1', '2', '3') THEN
    v_complexity_adjustment := 'elementary';
  ELSIF p_target_grade IN ('4', '5', '6') THEN
    v_complexity_adjustment := 'middle';
  ELSIF p_target_grade IN ('7', '8', '9', '10', '11', '12') THEN
    v_complexity_adjustment := 'high';
  ELSE
    v_complexity_adjustment := 'general';
  END IF;
  
  -- Add adaptation metadata
  v_adapted := jsonb_set(
    v_adapted,
    '{adaptation_metadata}',
    jsonb_build_object(
      'original_template_id', p_template_id,
      'target_grade', p_target_grade,
      'target_pacing', p_target_pacing,
      'complexity_level', v_complexity_adjustment,
      'duration_multiplier', v_duration_multiplier
    )
  );
  
  RETURN v_adapted;
END;
$$;

-- ============================================================================
-- 4. Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION adapt_template_for_grade_pacing TO authenticated;

-- ============================================================================
-- 5. Add comments
-- ============================================================================

COMMENT ON COLUMN lesson_templates.grade_levels IS 'Array of grade levels this template is designed for (e.g., ["K", "1", "2"] or ["9", "10"])';
COMMENT ON COLUMN lesson_templates.pacing IS 'Pacing option: fast, normal, slow, or flexible';
COMMENT ON COLUMN lesson_templates.adaptation_rules IS 'JSONB object with custom adaptation rules';

