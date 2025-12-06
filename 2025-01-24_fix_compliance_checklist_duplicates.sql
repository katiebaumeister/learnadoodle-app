-- Fix duplicate compliance checklist items
-- Add unique constraint to prevent duplicates at database level
-- Also clean up any existing duplicates

-- Step 1: Handle NULL requirement_id cases first
-- If requirement_id is NULL, we can't use it for deduplication, so we'll need to handle those separately
-- For now, we'll only deduplicate items with non-NULL requirement_id

-- Step 2: Remove duplicates keeping the most recent one (for items with requirement_id)
WITH ranked_items AS (
  SELECT 
    id,
    child_id,
    state_code,
    requirement_id,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY child_id, state_code, requirement_id 
      ORDER BY created_at DESC NULLS LAST
    ) as rn
  FROM family_compliance_checklist
  WHERE requirement_id IS NOT NULL
)
DELETE FROM family_compliance_checklist
WHERE id IN (
  SELECT id FROM ranked_items WHERE rn > 1
);

-- Step 3: For items with NULL requirement_id, try to deduplicate by matching requirement titles
-- This is a best-effort cleanup - items without requirement_id are harder to deduplicate
-- We'll leave these for manual cleanup or frontend deduplication

-- Step 4: Add unique constraint to prevent future duplicates
-- Note: This constraint only applies when requirement_id is NOT NULL
-- We use a partial unique index to handle NULL requirement_id cases
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'family_compliance_checklist_unique_child_state_requirement'
  ) THEN
    ALTER TABLE family_compliance_checklist
    DROP CONSTRAINT family_compliance_checklist_unique_child_state_requirement;
  END IF;
  
  -- Create partial unique index (only applies when requirement_id is NOT NULL)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'family_compliance_checklist_unique_child_state_requirement_idx'
  ) THEN
    CREATE UNIQUE INDEX family_compliance_checklist_unique_child_state_requirement_idx
    ON family_compliance_checklist (child_id, state_code, requirement_id)
    WHERE requirement_id IS NOT NULL;
  END IF;
END $$;

-- Add comment
COMMENT ON INDEX family_compliance_checklist_unique_child_state_requirement_idx 
ON family_compliance_checklist IS 
'Prevents duplicate checklist items for the same child, state, and requirement (when requirement_id is not NULL)';

