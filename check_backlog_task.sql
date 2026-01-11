-- Diagnostic query to check if your backlog task meets the criteria
-- Replace 'test backlog' with your actual task title, or use the task ID

-- Option 1: Check by title
SELECT 
  id,
  title,
  is_backlog,
  status,
  deleted_at,
  canceled_at,
  family_id,
  child_id,
  due_ts,
  created_at
FROM events
WHERE title ILIKE '%test backlog%'
  AND family_id IS NOT NULL;

-- Option 2: Check if it would be returned by the RPC query
SELECT 
  id,
  title,
  is_backlog,
  status,
  deleted_at,
  canceled_at,
  -- Check if it meets all criteria
  CASE 
    WHEN COALESCE(is_backlog, false) = true THEN '✓ is_backlog = true'
    ELSE '✗ is_backlog is not true'
  END as backlog_check,
  CASE 
    WHEN COALESCE(status, 'scheduled') NOT IN ('done', 'canceled') THEN '✓ status is valid'
    ELSE '✗ status is done or canceled'
  END as status_check,
  CASE 
    WHEN deleted_at IS NULL THEN '✓ not deleted'
    ELSE '✗ is deleted'
  END as deleted_check,
  CASE 
    WHEN canceled_at IS NULL THEN '✓ not canceled'
    ELSE '✗ is canceled'
  END as canceled_check
FROM events
WHERE title ILIKE '%test backlog%'
  AND family_id IS NOT NULL;

-- Option 3: Test the actual RPC query (replace YOUR_FAMILY_ID with your actual family_id)
-- First, find your family_id:
-- SELECT family_id FROM profiles WHERE id = auth.uid();

-- Then test the backlog_tasks CTE logic:
SELECT 
  e.id, 
  e.title, 
  e.child_id, 
  e.status, 
  e.description,
  e.due_ts,
  e.estimated_minutes,
  CASE 
    WHEN e.due_ts IS NOT NULL THEN 
      CASE
        WHEN (e.due_ts AT TIME ZONE 'America/New_York')::date = CURRENT_DATE THEN
          'Today'
        WHEN (e.due_ts AT TIME ZONE 'America/New_York')::date = CURRENT_DATE + 1 THEN
          'Tomorrow'
        WHEN (e.due_ts AT TIME ZONE 'America/New_York')::date < CURRENT_DATE THEN
          'Overdue'
        ELSE
          TO_CHAR((e.due_ts AT TIME ZONE 'America/New_York'), 'Mon, MMM DD')
      END
    ELSE NULL
  END AS due_time
FROM events e
WHERE e.family_id = 'YOUR_FAMILY_ID'  -- Replace with your family_id
  AND COALESCE(e.is_backlog, false) = true
  AND COALESCE(e.status, 'scheduled') NOT IN ('done', 'canceled')
  AND (e.deleted_at IS NULL)
  AND (e.canceled_at IS NULL)
ORDER BY 
  CASE WHEN e.due_ts IS NOT NULL AND e.due_ts < NOW() THEN 0 ELSE 1 END,
  COALESCE(e.due_ts, e.created_at) ASC
LIMIT 50;



