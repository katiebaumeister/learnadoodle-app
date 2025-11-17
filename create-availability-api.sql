-- Step 4: One canonical API for planning & UI: /availability
-- Goal: one endpoint both the UI and the AI can use

-- 1. Create function to get availability for a child within a date range
CREATE OR REPLACE FUNCTION get_child_availability(
  p_child_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE (
  date DATE,
  day_status TEXT,
  start_time TIME,
  end_time TIME,
  available_blocks JSONB,
  existing_events JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH date_range AS (
    SELECT generate_series(p_from_date, p_to_date, '1 day'::interval)::date AS date
  ),
  cache_data AS (
    SELECT 
      cdc.date,
      cdc.day_status,
      cdc.first_block_start as start_time,
      cdc.last_block_end as end_time,
      cdc.source_summary
    FROM calendar_days_cache cdc
    WHERE cdc.child_id = p_child_id
      AND cdc.date BETWEEN p_from_date AND p_to_date
  ),
  events_data AS (
    SELECT 
      e.date::date as date,
      jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'title', e.title,
          'start_ts', e.start_ts,
          'end_ts', e.end_ts,
          'status', e.status,
          'subject_id', e.subject_id,
          'description', e.description
        )
      ) as events
    FROM (
      SELECT 
        id,
        title,
        start_ts,
        end_ts,
        status,
        subject_id,
        description,
        start_ts::date as date
      FROM events
      WHERE child_id = p_child_id
        AND start_ts::date BETWEEN p_from_date AND p_to_date
        AND status IN ('scheduled', 'done')
    ) e
    GROUP BY e.date
  ),
  availability_blocks AS (
    SELECT 
      dr.date,
      cd.day_status,
      cd.start_time,
      cd.end_time,
      CASE 
        WHEN cd.day_status = 'off' THEN '[]'::jsonb
        WHEN cd.day_status = 'teach' THEN
          jsonb_build_array(
            jsonb_build_object(
              'start', cd.start_time::text,
              'end', cd.end_time::text,
              'status', 'available'
            )
          )
        ELSE '[]'::jsonb
      END as available_blocks,
      COALESCE(ed.events, '[]'::jsonb) as existing_events
    FROM date_range dr
    LEFT JOIN cache_data cd ON dr.date = cd.date
    LEFT JOIN events_data ed ON dr.date = ed.date
  )
  SELECT 
    ab.date,
    COALESCE(ab.day_status, 'off') as day_status,
    ab.start_time,
    ab.end_time,
    ab.available_blocks,
    ab.existing_events
  FROM availability_blocks ab
  ORDER BY ab.date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create function to get family-wide availability
CREATE OR REPLACE FUNCTION get_family_availability(
  p_family_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE (
  child_id UUID,
  child_name TEXT,
  availability_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as child_id,
    c.first_name as child_name,
    jsonb_agg(
      jsonb_build_object(
        'date', av.date,
        'day_status', av.day_status,
        'start_time', av.start_time,
        'end_time', av.end_time,
        'available_blocks', av.available_blocks,
        'existing_events', av.existing_events
      ) ORDER BY av.date
    ) as availability_data
  FROM children c
  CROSS JOIN LATERAL get_child_availability(c.id, p_from_date, p_to_date) av
  WHERE c.family_id = p_family_id
  GROUP BY c.id, c.first_name
  ORDER BY c.first_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create function to find available time slots for scheduling
CREATE OR REPLACE FUNCTION find_available_slots(
  p_child_id UUID,
  p_date DATE,
  p_duration_minutes INTEGER DEFAULT 60,
  p_preferred_start_time TIME DEFAULT '09:00',
  p_preferred_end_time TIME DEFAULT '17:00'
)
RETURNS TABLE (
  start_time TIME,
  end_time TIME,
  duration_minutes INTEGER,
  available BOOLEAN
) AS $$
DECLARE
  child_availability RECORD;
  slot_start TIME;
  slot_end TIME;
  slot_time TIME;
  time_increment INTERVAL := '30 minutes';
BEGIN
  -- Get child's availability for the date
  SELECT * INTO child_availability
  FROM get_child_availability(p_child_id, p_date, p_date)
  WHERE date = p_date;
  
  -- If no availability data or day is off, return empty
  IF child_availability IS NULL OR child_availability.day_status = 'off' THEN
    RETURN;
  END IF;
  
  -- Set working hours
  slot_start := GREATEST(child_availability.start_time, p_preferred_start_time);
  slot_end := LEAST(child_availability.end_time, p_preferred_end_time);
  
  -- Generate time slots
  slot_time := slot_start;
  WHILE slot_time + (p_duration_minutes || ' minutes')::interval <= slot_end LOOP
    -- Check if this slot conflicts with existing events
    IF NOT EXISTS (
      SELECT 1 FROM events
      WHERE child_id = p_child_id
        AND start_ts::date = p_date
        AND status IN ('scheduled', 'done')
        AND tstzrange(start_ts, end_ts, '[)') && 
            tstzrange(
              (p_date || ' ' || slot_time)::timestamptz,
              (p_date || ' ' || slot_time)::timestamptz + (p_duration_minutes || ' minutes')::interval,
              '[)'
            )
    ) THEN
      RETURN QUERY SELECT 
        slot_time,
        slot_time + (p_duration_minutes || ' minutes')::interval,
        p_duration_minutes,
        true;
    END IF;
    
    slot_time := slot_time + time_increment;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create function to check scheduling conflicts
CREATE OR REPLACE FUNCTION check_scheduling_conflict(
  p_child_id UUID,
  p_start_ts TIMESTAMPTZ,
  p_end_ts TIMESTAMPTZ,
  p_exclude_event_id UUID DEFAULT NULL
)
RETURNS TABLE (
  has_conflict BOOLEAN,
  conflicting_events JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) > 0 as has_conflict,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'title', e.title,
          'start_ts', e.start_ts,
          'end_ts', e.end_ts,
          'status', e.status
        )
      ),
      '[]'::jsonb
    ) as conflicting_events
  FROM events e
  WHERE e.child_id = p_child_id
    AND e.status IN ('scheduled', 'done')
    AND tstzrange(e.start_ts, e.end_ts, '[)') && tstzrange(p_start_ts, p_end_ts, '[)')
    AND (p_exclude_event_id IS NULL OR e.id != p_exclude_event_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create function to get timezone for family
CREATE OR REPLACE FUNCTION get_family_timezone(p_family_id UUID)
RETURNS TEXT AS $$
DECLARE
  family_tz TEXT;
BEGIN
  SELECT COALESCE(timezone, 'UTC') INTO family_tz
  FROM family
  WHERE id = p_family_id;
  
  RETURN family_tz;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create a comprehensive availability function that mimics the API response
CREATE OR REPLACE FUNCTION get_availability_api_response(
  p_child_id UUID DEFAULT NULL,
  p_family_id UUID DEFAULT NULL,
  p_from_date DATE DEFAULT CURRENT_DATE,
  p_to_date DATE DEFAULT (CURRENT_DATE + INTERVAL '14 days')::date
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  family_tz TEXT;
  availability_data JSONB;
  events_data JSONB;
BEGIN
  -- Get family timezone
  IF p_family_id IS NOT NULL THEN
    family_tz := get_family_timezone(p_family_id);
  ELSE
    family_tz := 'UTC';
  END IF;
  
  -- Get availability data
  IF p_child_id IS NOT NULL THEN
    -- Single child availability
    SELECT jsonb_agg(
      jsonb_build_object(
        'date', date,
        'start', start_time::text,
        'end', end_time::text,
        'status', day_status
      )
    ) INTO availability_data
    FROM get_child_availability(p_child_id, p_from_date, p_to_date);
    
    -- Get events data
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'title', title,
        'start_ts', start_ts,
        'end_ts', end_ts,
        'status', status
      )
    ) INTO events_data
    FROM events
    WHERE child_id = p_child_id
      AND start_ts::date BETWEEN p_from_date AND p_to_date
      AND status IN ('scheduled', 'done');
  ELSE
    -- Family-wide availability
    SELECT jsonb_agg(
      jsonb_build_object(
        'child_id', child_id,
        'child_name', child_name,
        'windows', availability_data
      )
    ) INTO availability_data
    FROM get_family_availability(p_family_id, p_from_date, p_to_date);
    
    -- Get family events data
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'title', title,
        'child_id', child_id,
        'start_ts', start_ts,
        'end_ts', end_ts,
        'status', status
      )
    ) INTO events_data
    FROM events
    WHERE family_id = p_family_id
      AND start_ts::date BETWEEN p_from_date AND p_to_date
      AND status IN ('scheduled', 'done');
  END IF;
  
  -- Build final response
  result := jsonb_build_object(
    'timezone', family_tz,
    'windows', COALESCE(availability_data, '[]'::jsonb),
    'events', COALESCE(events_data, '[]'::jsonb)
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create indexes for performance
-- Note: We can't use functional indexes with ::date cast, so we'll use timestamp indexes
CREATE INDEX IF NOT EXISTS idx_events_child_timestamp_status ON events (child_id, start_ts, status);
CREATE INDEX IF NOT EXISTS idx_events_family_timestamp_status ON events (family_id, start_ts, status);
CREATE INDEX IF NOT EXISTS idx_events_time_range_status ON events (start_ts, end_ts, status) WHERE status IN ('scheduled', 'done');
CREATE INDEX IF NOT EXISTS idx_events_child_status ON events (child_id, status) WHERE status IN ('scheduled', 'done');
CREATE INDEX IF NOT EXISTS idx_events_family_status ON events (family_id, status) WHERE status IN ('scheduled', 'done');

-- 8. Test the availability functions
-- Example usage:
-- SELECT * FROM get_child_availability('your-child-id', '2025-01-15', '2025-01-21');
-- SELECT * FROM find_available_slots('your-child-id', '2025-01-15', 60);
-- SELECT get_availability_api_response('your-child-id', NULL, '2025-01-15', '2025-01-21');
