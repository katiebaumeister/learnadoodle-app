-- ============================================================================
-- Consolidate material-child relationships to use material_children exclusively
-- ============================================================================
-- This migration removes the redundant materials.child_id column and ensures
-- all child relationships use the material_children junction table.
--
-- Note: material_children and material_reviews are NOT being removed - they are
-- necessary junction tables for many-to-many relationships that cannot be
-- flattened into the materials table.

-- Step 1: Migrate all materials.child_id entries to material_children
-- For file-based materials that have child_id set, create corresponding material_children entries
INSERT INTO material_children (material_id, child_id, family_id, status, created_at, updated_at)
SELECT 
  m.id AS material_id,
  m.child_id,
  m.family_id,
  'in_use' AS status, -- Use 'in_use' status for file-based materials (they're actively assigned)
  m.created_at,
  COALESCE(m.updated_at, m.created_at)
FROM materials m
WHERE m.child_id IS NOT NULL
  AND NOT EXISTS (
    -- Only insert if material_children entry doesn't already exist
    SELECT 1 FROM material_children mc 
    WHERE mc.material_id = m.id AND mc.child_id = m.child_id
  )
ON CONFLICT (material_id, child_id) DO NOTHING;

-- Step 2: Mark materials.child_id as deprecated (will be dropped in separate migration after code update)
COMMENT ON COLUMN materials.child_id IS 'DEPRECATED: Use material_children table instead. All child relationships must go through material_children junction table. This column will be dropped after code migration.';

-- Step 3: Log migration
DO $$
DECLARE
  migrated_count INT;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM materials m
  WHERE m.child_id IS NOT NULL;
  
  RAISE NOTICE 'Consolidation step 1 complete: % materials with child_id migrated to material_children', migrated_count;
  RAISE NOTICE 'Next step: Update code to use material_children instead of materials.child_id';
  RAISE NOTICE 'Then: Drop materials.child_id column in future migration';
END $$;

