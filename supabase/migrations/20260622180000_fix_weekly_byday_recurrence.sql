-- Fix weekly recurrence so multi-day rules (e.g. Mon–Fri) expand correctly, and
-- store recurrence_rule on every generated instance so editing an occurrence shows
-- it as a repeating event.
--
-- Background:
--   create_task_event expands recurrences by stepping the start date forward. For
--   WEEKLY it simply added N weeks, so a rule like byweekday = ["MO","TU","WE","TH","FR"]
--   only produced events on the start weekday (Mondays). It also inserted instances
--   WITHOUT recurrence_rule, so the edit modal loaded them as one-off ("Just once").
--
-- This migration patches the currently-deployed function body in place (regardless of
-- which create_task_event revision is live) by:
--   1. Stepping day-by-day for WEEKLY rules that specify weekdays.
--   2. Skipping dates whose weekday is not selected.
--   3. Writing recurrence_rule onto generated instances.
--
-- Note: this only affects events created after the migration runs. Series created
-- before the fix keep their old (single-weekday, non-repeating-on-edit) rows.

DO $$
DECLARE
  rec RECORD;
  def text;
  search_str text;
  replace_str text;
  patched_count integer := 0;
BEGIN
  FOR rec IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'create_task_event'
  LOOP
    def := pg_get_functiondef(rec.oid);

    -- Only patch the overload that actually contains the recurring-instance loop.
    IF position(E'WHEN ''WEEKLY'' THEN' IN def) = 0
       OR position('parent_event_id points to master' IN def) = 0 THEN
      CONTINUE;
    END IF;

    -- 1) WEEKLY advance: step one day at a time when explicit weekdays are given.
    search_str := E'        WHEN ''WEEKLY'' THEN\n          _current_date := _current_date + (_interval_val || '' weeks'')::interval;';
    IF position(search_str IN def) > 0 THEN
      replace_str := E'        WHEN ''WEEKLY'' THEN\n'
        || E'          IF (_recurrence_rule_jsonb ? ''byweekday'')\n'
        || E'             AND jsonb_array_length(COALESCE(_recurrence_rule_jsonb->''byweekday'', ''[]''::jsonb)) > 0 THEN\n'
        || E'            _current_date := _current_date + interval ''1 day'';\n'
        || E'          ELSE\n'
        || E'            _current_date := _current_date + (_interval_val || '' weeks'')::interval;\n'
        || E'          END IF;';
      def := replace(def, search_str, replace_str);
    ELSE
      RAISE WARNING 'create_task_event: WEEKLY advance anchor not found; skipping byday step.';
    END IF;

    -- 2) Only emit dates whose weekday is in the selected set.
    search_str := E'      -- Calculate new start and end times (preserve time of day and timezone)';
    IF position(search_str IN def) > 0 THEN
      replace_str := E'      -- For WEEKLY rules with explicit weekdays, only emit selected weekdays.\n'
        || E'      IF _frequency = ''WEEKLY''\n'
        || E'         AND (_recurrence_rule_jsonb ? ''byweekday'')\n'
        || E'         AND jsonb_array_length(COALESCE(_recurrence_rule_jsonb->''byweekday'', ''[]''::jsonb)) > 0 THEN\n'
        || E'        IF NOT EXISTS (\n'
        || E'          SELECT 1\n'
        || E'          FROM jsonb_array_elements_text(_recurrence_rule_jsonb->''byweekday'') AS tok\n'
        || E'          WHERE (CASE tok\n'
        || E'                    WHEN ''SU'' THEN 0 WHEN ''MO'' THEN 1 WHEN ''TU'' THEN 2 WHEN ''WE'' THEN 3\n'
        || E'                    WHEN ''TH'' THEN 4 WHEN ''FR'' THEN 5 WHEN ''SA'' THEN 6 END)\n'
        || E'                 = EXTRACT(DOW FROM _current_date)::int\n'
        || E'        ) THEN\n'
        || E'          CONTINUE;\n'
        || E'        END IF;\n'
        || E'      END IF;\n\n'
        || E'      -- Calculate new start and end times (preserve time of day and timezone)';
      def := replace(def, search_str, replace_str);
    ELSE
      RAISE WARNING 'create_task_event: instance-prep anchor not found; skipping byday filter.';
    END IF;

    -- 3a) Add recurrence_rule to the instance INSERT column list.
    search_str := E'        shared_class_id,\n        parent_event_id,\n        recurrence_id,\n        created_at,\n        updated_at';
    IF position(search_str IN def) > 0 THEN
      replace_str := E'        shared_class_id,\n        recurrence_rule,\n        parent_event_id,\n        recurrence_id,\n        created_at,\n        updated_at';
      def := replace(def, search_str, replace_str);
    ELSE
      RAISE WARNING 'create_task_event: instance column-list anchor not found; instances may not carry recurrence_rule.';
    END IF;

    -- 3b) Add the matching value to the instance INSERT values list.
    search_str := E'        _shared_class_id,\n        _event_id, -- parent_event_id points to master';
    IF position(search_str IN def) > 0 THEN
      replace_str := E'        _shared_class_id,\n        _recurrence_rule_jsonb,\n        _event_id, -- parent_event_id points to master';
      def := replace(def, search_str, replace_str);
    ELSE
      RAISE WARNING 'create_task_event: instance value-list anchor not found; instances may not carry recurrence_rule.';
    END IF;

    EXECUTE def;
    patched_count := patched_count + 1;
  END LOOP;

  IF patched_count = 0 THEN
    RAISE WARNING 'create_task_event: no overload with a recurring loop was found; nothing patched.';
  ELSE
    RAISE NOTICE 'create_task_event patched (% overload(s)): weekly byday expansion + recurrence_rule on instances.', patched_count;
  END IF;
END $$;
