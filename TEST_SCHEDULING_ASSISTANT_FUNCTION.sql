-- Test the get_busy_intervals function
-- Run this in Supabase SQL Editor to verify the function works

-- First, check if the function exists
SELECT 
    routine_name, 
    routine_type,
    data_type as return_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name = 'get_busy_intervals';

-- Test the function with sample data
-- Replace these values with your actual family_id, child_id, and time range
-- Example:
-- SELECT * FROM get_busy_intervals(
--   '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'::uuid,  -- family_id
--   '4e3633b8-85d0-4dcd-a19b-b32181d872ec'::uuid,  -- child_id
--   '2026-01-18T05:00:00Z'::timestamptz,            -- weekStart (UTC)
--   '2026-01-25T04:59:59Z'::timestamptz              -- weekEnd (UTC)
-- );

-- Check what events exist for this time range
-- Replace with your actual family_id and child_id
SELECT 
    id,
    title,
    child_id,
    start_ts,
    end_ts,
    is_backlog,
    status,
    deleted_at,
    family_id
FROM events
WHERE family_id = '86ba8b4b-e138-4af3-949d-ac2e1d3a00c9'::uuid  -- Replace with your family_id
  AND (child_id = '4e3633b8-85d0-4dcd-a19b-b32181d872ec'::uuid OR child_id IS NULL)  -- Replace with your child_id
  AND start_ts < '2026-01-25T04:59:59Z'::timestamptz
  AND end_ts > '2026-01-18T05:00:00Z'::timestamptz
  AND status != 'canceled'
  AND deleted_at IS NULL
  AND (is_backlog IS NULL OR is_backlog = false)
ORDER BY start_ts;
