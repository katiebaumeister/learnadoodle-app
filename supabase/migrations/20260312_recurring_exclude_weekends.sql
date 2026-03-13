-- Recurring events: support exclude_weekends for DAILY recurrence.
-- When recurrence_rule has "exclude_weekends": true and frequency is DAILY,
-- generated instances skip Saturday (6) and Sunday (0).
-- Frontend (TaskCreateModal) sends exclude_weekends in the rule; this migration
-- updates create_task_event to honor it.

-- We add the weekend-skip logic by replacing the recurring LOOP section.
-- The existing function is in 2025_add_recurring_events_support.sql.
-- This migration adds a small block after "END CASE;" in the recurring loop:
-- for DAILY + exclude_weekends, advance _current_date until it's a weekday (1-5).

DO $$
DECLARE
  func_oid oid;
  def text;
  search_str text;
  replace_str text;
BEGIN
  SELECT p.oid INTO func_oid
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'create_task_event'
  LIMIT 1;

  IF func_oid IS NULL THEN
    RAISE NOTICE 'create_task_event not found; skipping exclude_weekends patch.';
    RETURN;
  END IF;

  def := pg_get_functiondef(func_oid);

  -- Match the exact pattern after END CASE; (pg_get_functiondef preserves newlines and spaces)
  search_str := E'      END CASE;
      
      -- Check if we''ve reached the end date';
  replace_str := E'      END CASE;
      
      -- For DAILY + exclude_weekends: skip Saturday (6) and Sunday (0)
      IF _frequency = ''DAILY'' AND (_recurrence_rule_jsonb->>''exclude_weekends'')::text IN (''true'', ''1'') THEN
        WHILE EXTRACT(DOW FROM _current_date) IN (0, 6) LOOP
          _current_date := _current_date + 1;
          IF _end_date IS NOT NULL AND _current_date > _end_date THEN
            EXIT;
          END IF;
        END LOOP;
        IF _end_date IS NOT NULL AND _current_date > _end_date THEN
          EXIT;
        END IF;
      END IF;
      
      -- Check if we''ve reached the end date';

  IF def IS NULL OR position(search_str IN def) = 0 THEN
    RAISE NOTICE 'create_task_event body not found or already patched; skipping.';
    RETURN;
  END IF;

  def := replace(def, search_str, replace_str);
  EXECUTE def;
  RAISE NOTICE 'Patched create_task_event to support exclude_weekends for DAILY recurrence.';
END $$;
