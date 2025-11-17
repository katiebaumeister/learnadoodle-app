-- Planner Helper Functions and Performance Logging
-- Run this before other planner RPCs

-- Performance logging table (optional but useful)
CREATE TABLE IF NOT EXISTS public.rpc_perf_log(
  id BIGSERIAL PRIMARY KEY,
  func_name TEXT NOT NULL,
  dur_ms INT NOT NULL,
  at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rpc_perf_log_func_at ON public.rpc_perf_log(func_name, at);

-- Helper: Calculate minutes between timestamps
CREATE OR REPLACE FUNCTION public._minutes_between(_s TIMESTAMPTZ, _e TIMESTAMPTZ)
RETURNS INT
LANGUAGE SQL
IMMUTABLE
AS $$ 
  SELECT GREATEST(0, EXTRACT(EPOCH FROM (_e - _s)) / 60)::int;
$$;

-- Set event status (used by Day Drawer)
CREATE OR REPLACE FUNCTION public.set_event_status(
  _event_id UUID,
  _status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE 
  t0 TIMESTAMPTZ := clock_timestamp();
  _ok BOOLEAN;
BEGIN
  UPDATE public.events 
  SET status = _status,
      updated_at = NOW()
  WHERE id = _event_id;
  
  _ok := FOUND;
  
  INSERT INTO public.rpc_perf_log(func_name, dur_ms) 
  VALUES ('set_event_status', EXTRACT(MILLISECONDS FROM (clock_timestamp() - t0))::int);
  
  RETURN jsonb_build_object('ok', _ok);
END $$;

-- Create event with overlap guard
CREATE OR REPLACE FUNCTION public.create_event_checked(
  _family UUID,
  _child UUID,
  _subject TEXT,
  _start_ts TIMESTAMPTZ,
  _end_ts TIMESTAMPTZ,
  _title TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE 
  t0 TIMESTAMPTZ := clock_timestamp();
  _id UUID;
BEGIN
  BEGIN
    INSERT INTO public.events(
      family_id,
      child_id,
      subject_id,
      start_ts,
      end_ts,
      status,
      title,
      source
    )
    VALUES (
      _family,
      _child,
      _subject,
      _start_ts,
      _end_ts,
      'scheduled',
      COALESCE(_title, 'Review block'),
      'quick_add'
    )
    RETURNING id INTO _id;
  EXCEPTION 
    WHEN exclusion_violation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'overlap');
    WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'database_error');
  END;
  
  INSERT INTO public.rpc_perf_log(func_name, dur_ms) 
  VALUES ('create_event_checked', EXTRACT(MILLISECONDS FROM (clock_timestamp() - t0))::int);
  
  RETURN jsonb_build_object('ok', true, 'event_id', _id);
END $$;

-- Quick add 20-min review in next available window
CREATE OR REPLACE FUNCTION public.quick_add_20min_review(
  _family UUID,
  _child UUID,
  _subject TEXT,
  _date DATE,
  _title TEXT DEFAULT '20-min review'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE 
  t0 TIMESTAMPTZ := clock_timestamp();
  _avail RECORD;
  _window JSONB;
  _start TIMESTAMPTZ;
  _end TIMESTAMPTZ;
  _window_start TEXT;
  _window_end TEXT;
  _res JSONB;
  _overlap BOOLEAN;
BEGIN
  -- Get availability for the day
  FOR _avail IN 
    SELECT * FROM get_child_availability(_child, _date, _date + 1)
  LOOP
    IF _avail.day_status NOT IN ('teach', 'partial') THEN
      CONTINUE;
    END IF;

    -- Try to find a 20-min slot in available blocks
    FOR _window IN SELECT * FROM jsonb_array_elements(_avail.available_blocks)
    LOOP
      _window_start := _window->>'start';
      _window_end := _window->>'end';
      
      -- Parse window times
      _start := (_date::text || ' ' || _window_start)::timestamptz;
      _end := _start + INTERVAL '20 minutes';
      
      -- Check if we can fit a 20-min block
      WHILE _end <= (_date::text || ' ' || _window_end)::timestamptz LOOP
        -- Check for overlaps
        SELECT EXISTS(
          SELECT 1 FROM public.events e 
          WHERE e.child_id = _child
            AND e.status IN ('scheduled', 'done')
            AND tstzrange(e.start_ts, e.end_ts, '[)') && tstzrange(_start, _end, '[)')
        ) INTO _overlap;
        
        IF NOT _overlap THEN
          -- Found a slot! Create the event
          SELECT public.create_event_checked(
            _family, _child, _subject, _start, _end, _title
          ) INTO _res;
          
          INSERT INTO public.rpc_perf_log(func_name, dur_ms) 
          VALUES ('quick_add_20min_review', EXTRACT(MILLISECONDS FROM (clock_timestamp() - t0))::int);
          
          RETURN _res;
        END IF;
        
        -- Try next 15-min slot
        _start := _start + INTERVAL '15 minutes';
        _end := _start + INTERVAL '20 minutes';
      END LOOP;
    END LOOP;
  END LOOP;
  
  INSERT INTO public.rpc_perf_log(func_name, dur_ms) 
  VALUES ('quick_add_20min_review', EXTRACT(MILLISECONDS FROM (clock_timestamp() - t0))::int);
  
  RETURN jsonb_build_object('ok', false, 'reason', 'no_window_found');
END $$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public._minutes_between(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_event_status(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_event_checked(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quick_add_20min_review(UUID, UUID, TEXT, DATE, TEXT) TO authenticated, service_role;
