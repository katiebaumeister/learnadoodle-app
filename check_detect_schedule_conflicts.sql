-- Diagnostic query to check what versions of detect_schedule_conflicts exist
-- Run this first to see what needs to be dropped

SELECT 
  oid::regprocedure::text as function_signature,
  proname as function_name,
  pg_get_function_arguments(oid) as arguments,
  pronargs as num_args
FROM pg_proc
WHERE proname = 'detect_schedule_conflicts'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY proname, pronargs;

-- Also check for dependencies (views, triggers, etc. that depend on the function)
SELECT 
  dependent_ns.nspname as dependent_schema,
  dependent_obj.relname as dependent_object,
  dependent_obj.relkind as object_type,
  source_ns.nspname as source_schema,
  source_func.proname as source_function,
  pg_get_function_identity_arguments(source_func.oid) as function_args
FROM pg_depend d
JOIN pg_class as dependent_obj ON d.objid = dependent_obj.oid
JOIN pg_proc as source_func ON d.refobjid = source_func.oid
JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent_obj.relnamespace
JOIN pg_namespace source_ns ON source_ns.oid = source_func.pronamespace
WHERE source_func.proname = 'detect_schedule_conflicts'
  AND dependent_obj.relkind IN ('v', 'r', 't'); -- views, tables, triggers
