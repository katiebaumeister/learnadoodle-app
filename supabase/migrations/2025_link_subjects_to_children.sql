-- Migration: Link existing subjects to children
-- This script helps assign subjects to children

-- Check if year_subjects table exists and use it if available
DO $$
BEGIN
  -- Option 1: Link subjects to children based on year_subjects table (if it exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'year_subjects') THEN
    UPDATE subject s
    SET child_id = ys.child_id
    FROM year_subjects ys
    WHERE s.id = ys.subject_id
      AND s.child_id IS NULL
      AND ys.child_id IS NOT NULL;
    
    RAISE NOTICE 'Linked subjects to children based on year_subjects table';
  ELSE
    RAISE NOTICE 'year_subjects table does not exist, skipping automatic linking';
  END IF;
END $$;

-- Option 2: Link subjects to children based on events table
-- If a subject is used in events for a child, link it to that child
DO $$
BEGIN
  -- Get the most common child_id for each subject from events
  UPDATE subject s
  SET child_id = subq.child_id
  FROM (
    SELECT 
      subject_id,
      child_id,
      ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY COUNT(*) DESC) as rn
    FROM events
    WHERE subject_id IS NOT NULL
      AND child_id IS NOT NULL
      AND deleted_at IS NULL
    GROUP BY subject_id, child_id
  ) subq
  WHERE s.id = subq.subject_id
    AND s.child_id IS NULL
    AND subq.rn = 1;
  
  RAISE NOTICE 'Linked subjects to children based on events table';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not link subjects from events table: %', SQLERRM;
END $$;

-- Show summary of subject assignments
SELECT 
  CASE 
    WHEN child_id IS NULL THEN 'Family-wide (all children)'
    ELSE 'Assigned to child: ' || child_id::text
  END as assignment,
  COUNT(*) as count,
  STRING_AGG(name, ', ' ORDER BY name) as subjects
FROM subject
GROUP BY child_id
ORDER BY child_id NULLS FIRST;

-- Manual assignment examples (uncomment and modify as needed):
-- To assign a subject to a specific child:
-- UPDATE subject SET child_id = 'CHILD_ID_HERE' WHERE id = 'SUBJECT_ID_HERE';
-- 
-- To assign all subjects to a specific child:
-- UPDATE subject SET child_id = 'CHILD_ID_HERE' WHERE child_id IS NULL;
--
-- To keep a subject as family-wide (show for all children):
-- UPDATE subject SET child_id = NULL WHERE id = 'SUBJECT_ID_HERE';

