-- ============================================================================
-- Drop materials.child_id column after migration to material_children
-- ============================================================================
-- This migration drops the materials.child_id column after all code has been
-- updated to use material_children table instead.
--
-- IMPORTANT: Only run this after:
-- 1. Migration 2025_consolidate_material_child_relationships.sql has been applied
-- 2. All code has been updated to use material_children instead of materials.child_id

-- Step 1: Verify all child_id values have been migrated to material_children
DO $$
DECLARE
  unmigrated_count INT;
BEGIN
  SELECT COUNT(*) INTO unmigrated_count
  FROM materials m
  WHERE m.child_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM material_children mc 
      WHERE mc.material_id = m.id AND mc.child_id = m.child_id
    );
  
  IF unmigrated_count > 0 THEN
    RAISE EXCEPTION 'Cannot drop materials.child_id: % entries have not been migrated to material_children. Run consolidation migration first.', unmigrated_count;
  END IF;
  
  RAISE NOTICE 'All materials.child_id values have been migrated to material_children';
END $$;

-- Step 2: Drop the child_id column from materials table
ALTER TABLE materials DROP COLUMN IF EXISTS child_id;

-- Step 3: Log completion
DO $$
BEGIN
  RAISE NOTICE 'materials.child_id column has been dropped';
  RAISE NOTICE 'All child relationships now use material_children junction table';
END $$;

