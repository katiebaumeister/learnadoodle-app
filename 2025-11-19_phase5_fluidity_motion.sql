-- Phase 5: Everyday Fluidity + Motion-AI
-- Chunk A: DB + RPC - Reschedule fields and week shifting

-- 1) Extend events table with reschedule tracking
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS reschedule_origin text,
  ADD COLUMN IF NOT EXISTS reschedule_reason text;

-- Add index for querying by reschedule origin
CREATE INDEX IF NOT EXISTS events_reschedule_origin_idx ON events(reschedule_origin) WHERE reschedule_origin IS NOT NULL;

-- 2) Create function to shift a week forward (add 7 days to all events in that week)
CREATE OR REPLACE FUNCTION shift_week_forward(
  p_family_id uuid,
  p_week_start date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_end date;
  v_shifted_count integer;
BEGIN
  -- Calculate week end (7 days after start)
  v_week_end := p_week_start + INTERVAL '7 days';
  
  -- Shift all events in that week forward by 7 days
  UPDATE events
  SET 
    start_ts = start_ts + INTERVAL '7 days',
    end_ts = end_ts + INTERVAL '7 days',
    reschedule_origin = 'shift_week',
    reschedule_reason = format('Week shifted forward from %s', p_week_start)
  WHERE family_id = p_family_id
    AND (start_ts AT TIME ZONE 'UTC')::date >= p_week_start
    AND (start_ts AT TIME ZONE 'UTC')::date < v_week_end
    AND status IN ('scheduled', 'done'); -- Only shift scheduled/done events, not missed/overdue
  
  GET DIAGNOSTICS v_shifted_count = ROW_COUNT;
  
  -- Optionally refresh calendar cache for affected weeks (current + next week)
  -- This helps keep the cache in sync
  BEGIN
    PERFORM refresh_calendar_days_cache(
      p_family_id,
      p_week_start,
      (v_week_end + INTERVAL '7 days')::date
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- If refresh fails, log but don't fail the shift operation
      RAISE NOTICE 'Calendar cache refresh failed: %', SQLERRM;
  END;
  
  RETURN v_shifted_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION shift_week_forward(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION shift_week_forward(uuid, date) TO authenticated;

-- 3) Add is_frozen column to calendar_days_cache if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calendar_days_cache' AND column_name = 'is_frozen'
  ) THEN
    ALTER TABLE calendar_days_cache ADD COLUMN is_frozen boolean DEFAULT false;
    
    -- Add index for querying frozen days
    CREATE INDEX IF NOT EXISTS calendar_days_cache_frozen_idx 
    ON calendar_days_cache(family_id, date) 
    WHERE is_frozen = true;
  END IF;
END $$;

