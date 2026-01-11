-- Migration: Remove duplicate family-wide subjects
-- Keep only one family-wide subject per name, delete the rest

-- Step 1: Identify duplicates (same name, same family_id, both with child_id = null)
-- Keep the oldest one (smallest id or earliest created_at)

DELETE FROM subject s1
WHERE s1.child_id IS NULL
  AND EXISTS (
    SELECT 1 FROM subject s2
    WHERE s2.family_id = s1.family_id
      AND s2.name = s1.name
      AND s2.child_id IS NULL
      AND (
        s2.id < s1.id  -- Keep the one with smaller ID (older)
        OR (s2.id = s1.id AND s2.created_at < s1.created_at)  -- Or earlier created_at if IDs are same
      )
  );

-- Step 2: Show summary of remaining subjects
SELECT 
  '=== REMAINING SUBJECTS AFTER DEDUPLICATION ===' as info;

SELECT 
  CASE 
    WHEN child_id IS NULL THEN 'Family-wide (all children)'
    ELSE 'Assigned to child: ' || c.first_name || ' (' || child_id::text || ')'
  END as assignment,
  COUNT(*) as count,
  STRING_AGG(name, ', ' ORDER BY name) as subjects
FROM subject s
LEFT JOIN children c ON s.child_id = c.id
GROUP BY child_id, c.first_name
ORDER BY child_id NULLS FIRST;

