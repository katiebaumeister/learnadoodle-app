-- Migration: Handle family-wide subjects
-- Choose one of the options below by uncommenting it

-- ============================================================================
-- OPTION 1: DELETE ALL FAMILY-WIDE SUBJECTS (Recommended)
-- ============================================================================
-- This removes all subjects with child_id = null
-- Use this if you want all subjects to be child-specific

-- DELETE FROM subject WHERE child_id IS NULL;

-- ============================================================================
-- OPTION 2: CONVERT FAMILY-WIDE TO CHILD-SPECIFIC
-- ============================================================================
-- This creates a copy of each family-wide subject for each child in the family
-- Then deletes the family-wide ones
-- Use this if you want to preserve the subjects but make them child-specific

-- Step 1: Create child-specific copies of family-wide subjects
-- INSERT INTO subject (family_id, child_id, name, grade, notes, created_at, updated_at)
-- SELECT DISTINCT
--   s.family_id,
--   c.id as child_id,
--   s.name,
--   s.grade,
--   s.notes,
--   NOW() as created_at,
--   NOW() as updated_at
-- FROM subject s
-- CROSS JOIN children c
-- WHERE s.child_id IS NULL
--   AND c.family_id = s.family_id
--   AND NOT EXISTS (
--     SELECT 1 FROM subject s2
--     WHERE s2.family_id = s.family_id
--       AND s2.name = s.name
--       AND s2.child_id = c.id
--   );

-- Step 2: Delete family-wide subjects after copying
-- DELETE FROM subject WHERE child_id IS NULL;

-- ============================================================================
-- OPTION 3: KEEP FAMILY-WIDE BUT UPDATE CODE TO SHOW THEM
-- ============================================================================
-- If you want to keep family-wide subjects and show them for all children,
-- you don't need to run any SQL. Just update the code in TaskCreateModal.js
-- to include family-wide subjects in the filter.

-- ============================================================================
-- SUMMARY QUERY (Run this to see current state)
-- ============================================================================
SELECT 
  CASE 
    WHEN child_id IS NULL THEN 'Family-wide (all children)'
    ELSE 'Assigned to child: ' || c.first_name || ' (' || child_id::text || ')'
  END as assignment,
  COUNT(*) as count,
  STRING_AGG(DISTINCT name, ', ' ORDER BY name) as subjects
FROM subject s
LEFT JOIN children c ON s.child_id = c.id
GROUP BY child_id, c.first_name
ORDER BY child_id NULLS FIRST;

