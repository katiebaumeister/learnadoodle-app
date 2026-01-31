-- Migration: Add metadata columns to events table
-- Adds: is_locked, move_window_start, move_window_end, priority, effort_minutes, location

DO $$
BEGIN
  -- Add is_locked column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'is_locked'
  ) THEN
    ALTER TABLE events ADD COLUMN is_locked BOOLEAN DEFAULT false;
    COMMENT ON COLUMN events.is_locked IS 'Prevents event from being moved or modified automatically';
    RAISE NOTICE 'Added is_locked column to events table';
  ELSE
    RAISE NOTICE 'is_locked column already exists in events table';
  END IF;

  -- Add move_window_start column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'move_window_start'
  ) THEN
    ALTER TABLE events ADD COLUMN move_window_start TIMESTAMPTZ;
    COMMENT ON COLUMN events.move_window_start IS 'Earliest allowed start time when rescheduling this event';
    RAISE NOTICE 'Added move_window_start column to events table';
  ELSE
    RAISE NOTICE 'move_window_start column already exists in events table';
  END IF;

  -- Add move_window_end column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'move_window_end'
  ) THEN
    ALTER TABLE events ADD COLUMN move_window_end TIMESTAMPTZ;
    COMMENT ON COLUMN events.move_window_end IS 'Latest allowed end time when rescheduling this event';
    RAISE NOTICE 'Added move_window_end column to events table';
  ELSE
    RAISE NOTICE 'move_window_end column already exists in events table';
  END IF;

  -- Add priority column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'priority'
  ) THEN
    ALTER TABLE events ADD COLUMN priority INTEGER DEFAULT 0;
    COMMENT ON COLUMN events.priority IS 'Priority level for scheduling (higher = more important, default 0)';
    RAISE NOTICE 'Added priority column to events table';
  ELSE
    RAISE NOTICE 'priority column already exists in events table';
  END IF;

  -- Add effort_minutes column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'effort_minutes'
  ) THEN
    ALTER TABLE events ADD COLUMN effort_minutes INTEGER;
    COMMENT ON COLUMN events.effort_minutes IS 'Expected effort duration in minutes (fallback to end_ts - start_ts if null)';
    RAISE NOTICE 'Added effort_minutes column to events table';
  ELSE
    RAISE NOTICE 'effort_minutes column already exists in events table';
  END IF;

  -- Add location column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'location'
  ) THEN
    ALTER TABLE events ADD COLUMN location TEXT;
    COMMENT ON COLUMN events.location IS 'Location type or name (e.g., home, co-op, virtual, etc.)';
    RAISE NOTICE 'Added location column to events table';
  ELSE
    RAISE NOTICE 'location column already exists in events table';
  END IF;

  -- Create indexes for performance
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_events_is_locked') THEN
    CREATE INDEX idx_events_is_locked ON public.events (is_locked) WHERE is_locked = true;
    RAISE NOTICE 'Created index idx_events_is_locked on events table';
  ELSE
    RAISE NOTICE 'Index idx_events_is_locked already exists';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_events_priority') THEN
    CREATE INDEX idx_events_priority ON public.events (priority) WHERE priority > 0;
    RAISE NOTICE 'Created index idx_events_priority on events table';
  ELSE
    RAISE NOTICE 'Index idx_events_priority already exists';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_events_location') THEN
    CREATE INDEX idx_events_location ON public.events (location) WHERE location IS NOT NULL;
    RAISE NOTICE 'Created index idx_events_location on events table';
  ELSE
    RAISE NOTICE 'Index idx_events_location already exists';
  END IF;

END $$;
