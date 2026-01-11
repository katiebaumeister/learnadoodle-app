-- =====================================================
-- Add 'material' to curriculum_units source_type constraint
-- Allows building curriculum from existing materials
-- =====================================================

DO $$
BEGIN
  -- Check if curriculum_units table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'curriculum_units'
  ) THEN
    -- Step 1: Drop the existing constraint if it exists
    ALTER TABLE curriculum_units DROP CONSTRAINT IF EXISTS curriculum_units_source_type_check;

    -- Step 2: Add new constraint with 'material' included
    ALTER TABLE curriculum_units
      ADD CONSTRAINT curriculum_units_source_type_check 
      CHECK (source_type IN ('topic', 'syllabus', 'pdf', 'link', 'material'));

    -- Step 3: Update comment for documentation
    COMMENT ON COLUMN curriculum_units.source_type IS 'Source type: topic, syllabus, pdf, link, material (required)';

    RAISE NOTICE '╔════════════════════════════════════════╗';
    RAISE NOTICE '║  MATERIAL SOURCE TYPE ADDED            ║';
    RAISE NOTICE '╚════════════════════════════════════════╝';
    RAISE NOTICE '';
    RAISE NOTICE 'Source types now include:';
    RAISE NOTICE '  topic, syllabus, pdf, link, material';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Database constraint updated to include material source type';
  ELSE
    RAISE NOTICE '⚠️  curriculum_units table does not exist. Skipping constraint update.';
    RAISE NOTICE '    This migration will be applied when curriculum_units table is created.';
  END IF;
END $$;

