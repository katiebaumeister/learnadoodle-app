-- Check what constraints exist on the events table
-- This will help us identify the overlap constraint

-- Check all constraints on events table
SELECT 
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'events'::regclass
ORDER BY contype, conname;

-- Check for EXCLUDE constraints specifically
SELECT 
  conname,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'events'::regclass
  AND contype = 'x';

-- Check for triggers that might check overlaps
SELECT 
  tgname as trigger_name,
  pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger
WHERE tgrelid = 'events'::regclass
  AND tgisinternal = false;

