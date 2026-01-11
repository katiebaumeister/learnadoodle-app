-- Migration: Consolidate subjects from all sources
-- This script makes the subject table the single source of truth

-- Step 1: Find all unique subject names used in events
CREATE TEMP TABLE IF NOT EXISTS event_subjects AS
SELECT DISTINCT
  e.family_id,
  e.child_id,
  e.subject_id,
  CASE 
    WHEN e.subject_id IS NOT NULL THEN s.name
    WHEN e.title ILIKE '%algebra%' OR e.title ILIKE '%math%' THEN 'Math'
    WHEN e.title ILIKE '%reading%' OR e.title ILIKE '%literature%' THEN 'Reading'
    WHEN e.title ILIKE '%writing%' OR e.title ILIKE '%composition%' THEN 'Writing'
    WHEN e.title ILIKE '%science%' THEN 'Science'
    WHEN e.title ILIKE '%history%' OR e.title ILIKE '%social studies%' THEN 'History'
    WHEN e.title ILIKE '%art%' OR e.title ILIKE '%drawing%' OR e.title ILIKE '%painting%' THEN 'Art'
    WHEN e.title ILIKE '%pe%' OR e.title ILIKE '%physical education%' OR e.title ILIKE '%gym%' THEN 'Physical Education'
    WHEN e.title ILIKE '%biography%' OR e.title ILIKE '%biographies%' THEN 'Biographies'
    ELSE NULL
  END as inferred_subject_name
FROM events e
LEFT JOIN subject s ON e.subject_id = s.id
WHERE e.deleted_at IS NULL
  AND e.family_id IS NOT NULL
  AND (
    e.subject_id IS NOT NULL 
    OR e.title IS NOT NULL
  );

-- Step 2: Remove duplicate subjects (keep the oldest one for each name+child_id combination)
DELETE FROM subject s1
WHERE s1.id IN (
  SELECT s2.id
  FROM subject s2
  WHERE EXISTS (
    SELECT 1 FROM subject s3
    WHERE s3.family_id = s2.family_id
      AND s3.name = s2.name
      AND (
        (s3.child_id IS NULL AND s2.child_id IS NULL)
        OR s3.child_id = s2.child_id
      )
      AND s3.id < s2.id  -- Keep the one with smaller ID (older)
  )
);

-- Step 3: Create missing subjects from events
INSERT INTO subject (family_id, child_id, name, created_at, updated_at)
SELECT DISTINCT
  es.family_id,
  es.child_id,
  COALESCE(es.inferred_subject_name, 'Other') as name,
  NOW() as created_at,
  NOW() as updated_at
FROM event_subjects es
WHERE es.inferred_subject_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM subject s2
    WHERE s2.family_id = es.family_id
      AND s2.name = es.inferred_subject_name
      AND (
        (s2.child_id IS NULL AND es.child_id IS NULL)
        OR s2.child_id = es.child_id
      )
  )
ON CONFLICT DO NOTHING;

-- Step 4: Update existing subjects to link to children based on events
-- If a subject is used by a child in events, link it to that child
UPDATE subject s
SET child_id = subq.child_id,
    updated_at = NOW()
FROM (
  SELECT 
    s2.id as subject_id,
    es.child_id,
    COUNT(*) as usage_count,
    ROW_NUMBER() OVER (PARTITION BY s2.id ORDER BY COUNT(*) DESC) as rn
  FROM subject s2
  INNER JOIN event_subjects es ON s2.name = es.inferred_subject_name
    AND s2.family_id = es.family_id
  WHERE s2.child_id IS NULL
    AND es.child_id IS NOT NULL
  GROUP BY s2.id, es.child_id
) subq
WHERE s.id = subq.subject_id
  AND subq.rn = 1
  AND s.child_id IS NULL;

-- Step 5: Handle subjects that should be family-wide
-- If a subject is used by multiple children, keep it as family-wide (child_id = NULL)
-- OR create separate entries for each child
-- For now, we'll keep multi-child subjects as family-wide
UPDATE subject s
SET child_id = NULL,
    updated_at = NOW()
WHERE s.child_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM event_subjects es
    WHERE es.family_id = s.family_id
      AND es.inferred_subject_name = s.name
      AND es.child_id != s.child_id
  );

-- Step 6: Create child-specific subjects for subjects used by multiple children
-- This ensures each child has their own copy of commonly used subjects
INSERT INTO subject (family_id, child_id, name, created_at, updated_at)
SELECT DISTINCT
  es.family_id,
  es.child_id,
  es.inferred_subject_name as name,
  NOW() as created_at,
  NOW() as updated_at
FROM event_subjects es
WHERE es.inferred_subject_name IS NOT NULL
  AND es.child_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM subject s2
    WHERE s2.family_id = es.family_id
      AND s2.name = es.inferred_subject_name
      AND s2.child_id = es.child_id
  )
ON CONFLICT DO NOTHING;

-- Step 7: Update events to link to correct subject_id
UPDATE events e
SET subject_id = s.id,
    updated_at = NOW()
FROM event_subjects es
INNER JOIN subject s ON s.family_id = es.family_id
  AND s.name = es.inferred_subject_name
  AND (
    (s.child_id IS NULL AND es.child_id IS NULL)
    OR s.child_id = es.child_id
  )
WHERE e.family_id = es.family_id
  AND e.child_id = es.child_id
  AND e.subject_id IS NULL
  AND es.inferred_subject_name IS NOT NULL
  AND s.id IS NOT NULL;

-- Step 8: Show final summary
SELECT 
  '=== SUBJECT CONSOLIDATION SUMMARY ===' as info;

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

-- Step 9: Show subjects by child
SELECT 
  '=== SUBJECTS BY CHILD ===' as info;

SELECT 
  c.first_name as child_name,
  c.id as child_id,
  COUNT(s.id) as subject_count,
  STRING_AGG(s.name, ', ' ORDER BY s.name) as subjects
FROM children c
LEFT JOIN subject s ON s.child_id = c.id
WHERE c.family_id IN (SELECT DISTINCT family_id FROM subject)
GROUP BY c.id, c.first_name
ORDER BY c.first_name;

-- Step 10: Show orphaned subjects (subjects not linked to any child and not family-wide)
SELECT 
  '=== ORPHANED SUBJECTS (need assignment) ===' as info;

SELECT 
  id,
  name,
  family_id,
  child_id,
  created_at
FROM subject
WHERE child_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM events e
    WHERE e.subject_id = subject.id
      AND e.deleted_at IS NULL
  )
ORDER BY name;

-- Cleanup
DROP TABLE IF EXISTS event_subjects;

