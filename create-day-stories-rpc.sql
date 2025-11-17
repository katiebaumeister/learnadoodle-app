-- Generate Day Stories (AI insights and quick actions)
-- Returns actionable story cards for the home screen

CREATE OR REPLACE FUNCTION public.generate_day_stories(
  _family UUID,
  _date DATE
)
RETURNS JSONB[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  t0 TIMESTAMPTZ := clock_timestamp();
  _day JSONB;
  _events JSONB;
  _availability JSONB;
  _goals_delta JSONB;
  _stories JSONB[] := ARRAY[]::JSONB[];
  _item JSONB;
  _total_windows_min INT := 0;
  _event_count INT := 0;
  _added INT := 0;
BEGIN
  -- Get day view data
  SELECT public.get_day_view(_family, _date, NULL) INTO _day;
  
  _events := COALESCE(_day->'events', '[]'::jsonb);
  _availability := COALESCE(_day->'availability', '[]'::jsonb);
  _goals_delta := COALESCE(_day->'goals_delta', '[]'::jsonb);
  
  _event_count := jsonb_array_length(_events);
  
  -- Calculate total available minutes
  FOR _item IN SELECT * FROM jsonb_array_elements(_availability)
  LOOP
    FOR _item IN SELECT * FROM jsonb_array_elements(_item->'windows')
    LOOP
      _total_windows_min := _total_windows_min + 
        public._minutes_between(
          (_item->>'start_ts')::timestamptz,
          (_item->>'end_ts')::timestamptz
        );
    END LOOP;
  END LOOP;

  -- Story 1: Empty day with availability
  IF _event_count = 0 AND _total_windows_min >= 60 THEN
    _stories := _stories || jsonb_build_object(
      'id', 'st-empty-day',
      'kind', 'planner',
      'title', 'Open slots today',
      'body', 'No sessions yet—plan 2 quick 20-min blocks.',
      'tag', 'Planner',
      'icon', 'sparkles',
      'cta', jsonb_build_object(
        'type', 'open_planner',
        'payload', jsonb_build_object('date', _date)
      )
    );
  END IF;

  -- Story 2-6: Goal top-offs (subjects that need more time)
  FOR _item IN 
    SELECT * FROM jsonb_array_elements(_goals_delta)
    WHERE (_item->>'minutes_needed')::int > 0
    ORDER BY (_item->>'minutes_needed')::int DESC
    LIMIT 5
  LOOP
    EXIT WHEN _added >= 5;
    
    _stories := _stories || jsonb_build_object(
      'id', 'st-topoff-' || (_item->>'child_id') || '-' || (_item->>'subject_id'),
      'kind', 'goal',
      'title', 'Add 20-min review',
      'body', format('Subject %s needs %s more minutes this week.',
        _item->>'subject_id',
        _item->>'minutes_needed'
      ),
      'tag', 'Tip',
      'icon', 'book-open',
      'cta', jsonb_build_object(
        'type', 'quick_add_review',
        'payload', jsonb_build_object(
          'child_id', _item->>'child_id',
          'subject_id', _item->>'subject_id',
          'minutes', 20,
          'date', _date
        )
      )
    );
    
    _added := _added + 1;
  END LOOP;

  -- Story 7: All on track (if no stories yet)
  IF array_length(_stories, 1) IS NULL OR array_length(_stories, 1) = 0 THEN
    _stories := _stories || jsonb_build_object(
      'id', 'st-on-track',
      'kind', 'celebrate',
      'title', 'Everything on track! 🎉',
      'body', 'All goals are being met. Keep up the great work!',
      'tag', 'Progress',
      'icon', 'check-circle',
      'cta', NULL
    );
  END IF;

  INSERT INTO public.rpc_perf_log(func_name, dur_ms) 
  VALUES ('generate_day_stories', EXTRACT(MILLISECONDS FROM (clock_timestamp() - t0))::int);
  
  RETURN _stories;
END $$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.generate_day_stories(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_day_stories(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_day_stories(UUID, DATE) TO anon;
