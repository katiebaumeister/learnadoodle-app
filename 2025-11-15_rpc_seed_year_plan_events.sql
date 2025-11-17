-- RPC: Seed events for a year plan
-- Part of Phase 1 - Year-Round Intelligence Core
-- Creates scheduled events based on year_plan_children subjects and hours/week targets

CREATE OR REPLACE FUNCTION public.seed_year_plan_events(
  p_year_plan_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan year_plans%rowtype;
  v_child_record record;
  v_subject jsonb;
  v_week_start date;
  v_week_end date;
  v_current_date date;
  v_block_minutes int := 60; -- Default 60-minute blocks
  v_block_count int;
  v_day_offset int;
  v_target_minutes int;
  v_subject_key text;
  v_subject_id uuid;
  v_subject_name text;
  v_event_start timestamptz;
  v_event_end timestamptz;
  v_default_start_time time := time '10:00'; -- Default 10:00 AM
  v_days_per_week int[] := ARRAY[0, 2, 4]; -- Mon, Wed, Fri (0=Monday, 2=Wednesday, 4=Friday)
  v_day_index int;
  v_target_day date;
  v_events_created int := 0;
  v_events_skipped int := 0;
  v_result jsonb;
BEGIN
  -- Get the year plan
  SELECT * INTO v_plan
  FROM year_plans
  WHERE id = p_year_plan_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Year plan % not found', p_year_plan_id;
  END IF;
  
  -- Prevent double-seeding: delete existing seeded events for this plan
  DELETE FROM events
  WHERE year_plan_id = p_year_plan_id
    AND source = 'year_plan_seed';
  
  -- Loop through each child in the year plan
  FOR v_child_record IN
    SELECT * FROM year_plan_children
    WHERE year_plan_id = p_year_plan_id
  LOOP
    -- Loop through each subject for this child
    FOR v_subject IN
      SELECT * FROM jsonb_array_elements(v_child_record.subjects)
    LOOP
      -- Extract subject info
      v_subject_key := v_subject->>'key';
      v_target_minutes := COALESCE((v_subject->>'targetMinPerWeek')::int, 0);
      
      IF v_target_minutes <= 0 THEN
        CONTINUE; -- Skip subjects with no target
      END IF;
      
      -- Calculate number of blocks needed (round up)
      v_block_count := CEIL(v_target_minutes::numeric / v_block_minutes);
      
      -- Try to find subject_id from subject table by name/key
      -- First try exact match on name
      SELECT id, name INTO v_subject_id, v_subject_name
      FROM subject
      WHERE family_id = v_plan.family_id
        AND (
          LOWER(name) = LOWER(v_subject_key)
          OR LOWER(name) = LOWER(REPLACE(v_subject_key, '_', ' '))
          OR LOWER(name) = LOWER(REPLACE(v_subject_key, '-', ' '))
        )
      LIMIT 1;
      
      -- If not found, use the key as the name
      IF v_subject_id IS NULL THEN
        v_subject_name := INITCAP(REPLACE(REPLACE(v_subject_key, '_', ' '), '-', ' '));
      END IF;
      
      -- Loop through weeks in the plan
      v_current_date := v_plan.start_date;
      WHILE v_current_date <= v_plan.end_date
      LOOP
        v_week_start := v_current_date;
        v_week_end := LEAST(v_current_date + INTERVAL '6 days', v_plan.end_date);
        
        -- Create blocks for this week (distribute across Mon/Wed/Fri pattern)
        v_day_index := 0;
        FOR v_day_offset IN SELECT unnest(v_days_per_week)
        LOOP
          -- Stop if we've created enough blocks for this week
          IF v_day_index >= v_block_count THEN
            EXIT;
          END IF;
          
          v_target_day := v_week_start + (v_day_offset || ' days')::interval;
          
          -- Skip if outside plan range
          IF v_target_day < v_plan.start_date OR v_target_day > v_plan.end_date THEN
            v_events_skipped := v_events_skipped + 1;
            v_day_index := v_day_index + 1;
            CONTINUE;
          END IF;
          
          -- Skip blackout days (day_status = 'off' or is_frozen = true)
          IF EXISTS (
            SELECT 1 FROM calendar_days_cache
            WHERE family_id = v_plan.family_id
              AND date = v_target_day
              AND (
                day_status = 'off'
                OR is_frozen = true
                OR is_shiftable = false
              )
          ) THEN
            v_events_skipped := v_events_skipped + 1;
            v_day_index := v_day_index + 1;
            CONTINUE;
          END IF;
          
          -- Calculate event times
          v_event_start := (v_target_day::timestamp + v_default_start_time)::timestamptz;
          v_event_end := v_event_start + (v_block_minutes || ' minutes')::interval;
          
          -- Check for overlapping events (same child, overlapping time range)
          IF EXISTS (
            SELECT 1 FROM events
            WHERE family_id = v_plan.family_id
              AND child_id = v_child_record.child_id
              AND (
                -- Event starts during existing event
                (start_ts <= v_event_start AND end_ts > v_event_start)
                OR
                -- Event ends during existing event
                (start_ts < v_event_end AND end_ts >= v_event_end)
                OR
                -- Event completely contains existing event
                (start_ts >= v_event_start AND end_ts <= v_event_end)
              )
          ) THEN
            v_events_skipped := v_events_skipped + 1;
            v_day_index := v_day_index + 1;
            CONTINUE;
          END IF;
          
          -- Insert the event
          INSERT INTO events (
            family_id,
            child_id,
            subject_id,
            year_plan_id,
            title,
            start_ts,
            end_ts,
            status,
            source,
            minutes,
            created_by
          ) VALUES (
            v_plan.family_id,
            v_child_record.child_id,
            v_subject_id, -- May be NULL if subject not found
            p_year_plan_id,
            v_subject_name,
            v_event_start,
            v_event_end,
            'scheduled',
            'year_plan_seed',
            v_block_minutes,
            v_plan.created_by
          );
          
          v_events_created := v_events_created + 1;
          v_day_index := v_day_index + 1;
        END LOOP;
        
        -- Move to next week
        v_current_date := v_week_end + INTERVAL '1 day';
      END LOOP;
    END LOOP;
  END LOOP;
  
  -- Refresh calendar cache for the plan range so UI reflects new events immediately
  BEGIN
    PERFORM refresh_calendar_days_cache(
      v_plan.family_id,
      v_plan.start_date,
      v_plan.end_date
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'seed_year_plan_events: Failed to refresh calendar cache for plan %: %', p_year_plan_id, SQLERRM;
  END;
  
  -- Return summary
  v_result := jsonb_build_object(
    'success', true,
    'year_plan_id', p_year_plan_id,
    'events_created', v_events_created,
    'events_skipped', v_events_skipped
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to seed year plan events: %', SQLERRM;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.seed_year_plan_events(uuid) TO authenticated, service_role;

