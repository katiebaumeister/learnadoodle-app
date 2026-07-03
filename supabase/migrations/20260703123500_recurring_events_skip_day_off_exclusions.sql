-- Recurring event generation should respect saved days off / breaks.
--
-- Day off is stored in planner_exclusions (holiday = single day, break = range).
-- create_task_event expands recurring event instances inside Postgres, so skipping
-- exclusions has to happen in the RPC as well as in the UI.

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

    -- Only patch the overload that contains the recurring-instance loop.
    IF position('parent_event_id points to master' IN def) = 0
       OR position(E'-- Calculate new start and end times (preserve time of day and timezone)' IN def) = 0 THEN
      CONTINUE;
    END IF;

    IF position('create_task_event: skip saved day off exclusions' IN def) > 0 THEN
      CONTINUE;
    END IF;

    search_str := E'      -- Calculate new start and end times (preserve time of day and timezone)';
    replace_str := E'      -- create_task_event: skip saved day off exclusions.\n'
      || E'      IF EXISTS (\n'
      || E'        SELECT 1\n'
      || E'        FROM public.planner_exclusions pe\n'
      || E'        WHERE pe.family_id = _family_id\n'
      || E'          AND COALESCE(pe.is_active, true) = true\n'
      || E'          AND pe.exclusion_type IN (\n'
      || E'            ''holiday'', ''break'', ''day_off'', ''dayoff'', ''day-off'',\n'
      || E'            ''no_school'', ''custom_holiday'', ''custom_break''\n'
      || E'          )\n'
      || E'          AND pe.start_date <= _current_date\n'
      || E'          AND pe.end_date >= _current_date\n'
      || E'          AND (\n'
      || E'            pe.scope_type IN (''family_default'', ''academic_year'', ''plan'')\n'
      || E'            OR (pe.scope_type = ''subject'' AND pe.subject_id IS NOT DISTINCT FROM _subject_id)\n'
      || E'          )\n'
      || E'      ) THEN\n'
      || E'        CONTINUE;\n'
      || E'      END IF;\n\n'
      || search_str;

    def := replace(def, search_str, replace_str);
    EXECUTE def;
    patched_count := patched_count + 1;
  END LOOP;

  IF patched_count = 0 THEN
    RAISE WARNING 'create_task_event: no recurring overload patched for day-off exclusions.';
  ELSE
    RAISE NOTICE 'create_task_event patched (% overload(s)): recurring instances skip saved days off.', patched_count;
  END IF;
END $$;
