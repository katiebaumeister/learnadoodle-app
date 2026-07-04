-- Add feature_settings JSONB column to family table.
-- Stores per-family feature toggles (learning_areas, assignments, materials, attendance, grades, compliance_records).
-- NULL means "use familyApproach defaults" (backward compatible).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'family' AND column_name = 'feature_settings'
  ) THEN
    ALTER TABLE family
      ADD COLUMN feature_settings JSONB DEFAULT NULL;

    COMMENT ON COLUMN family.feature_settings IS
      'Per-family feature toggles. NULL = derive from default_planning_mode. Keys: learning_areas, assignments, materials, attendance, grades, compliance_records (all boolean).';
  END IF;
END $$;
