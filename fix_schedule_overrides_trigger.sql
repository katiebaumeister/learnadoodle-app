-- Fix any broken triggers on schedule_overrides that might reference days_with_overrides
-- This script drops and recreates triggers to ensure they work correctly

-- Drop any existing triggers that might be broken
DROP TRIGGER IF EXISTS schedule_overrides_cache_trigger ON schedule_overrides;
DROP TRIGGER IF EXISTS schedule_overrides_cache_refresh ON schedule_overrides;
DROP TRIGGER IF EXISTS overrides_refresh ON schedule_overrides;

-- If there's a trigger function that's broken, we'll create a simple one that just calls refresh
-- But first, let's make sure the refresh function exists and works

-- Fix the broken trigger_refresh_calendar_cache function
-- It was trying to use NEW.family_id which doesn't exist on schedule_overrides
CREATE OR REPLACE FUNCTION trigger_refresh_calendar_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_family_id UUID;
  v_date DATE;
BEGIN
  -- Determine family_id from scope_type and scope_id (schedule_overrides doesn't have family_id column)
  IF TG_TABLE_NAME = 'schedule_overrides' THEN
    IF TG_OP = 'DELETE' THEN
      v_family_id := CASE 
        WHEN OLD.scope_type = 'family' THEN OLD.scope_id
        WHEN OLD.scope_type = 'child' THEN (
          SELECT c.family_id FROM children c WHERE c.id = OLD.scope_id LIMIT 1
        )
        ELSE NULL
      END;
      v_date := OLD.date;
    ELSE
      v_family_id := CASE 
        WHEN NEW.scope_type = 'family' THEN NEW.scope_id
        WHEN NEW.scope_type = 'child' THEN (
          SELECT c.family_id FROM children c WHERE c.id = NEW.scope_id LIMIT 1
        )
        ELSE NULL
      END;
      v_date := NEW.date;
    END IF;
  ELSIF TG_TABLE_NAME = 'schedule_rules' THEN
    -- For schedule_rules, also use scope_type/scope_id
    IF TG_OP = 'DELETE' THEN
      v_family_id := CASE 
        WHEN OLD.scope_type = 'family' THEN OLD.scope_id
        WHEN OLD.scope_type = 'child' THEN (
          SELECT c.family_id FROM children c WHERE c.id = OLD.scope_id LIMIT 1
        )
        ELSE NULL
      END;
    ELSE
      v_family_id := CASE 
        WHEN NEW.scope_type = 'family' THEN NEW.scope_id
        WHEN NEW.scope_type = 'child' THEN (
          SELECT c.family_id FROM children c WHERE c.id = NEW.scope_id LIMIT 1
        )
        ELSE NULL
      END;
    END IF;
    v_date := CURRENT_DATE;
  END IF;

  -- Only refresh if we have a valid family_id and the refresh function exists
  IF v_family_id IS NOT NULL THEN
    BEGIN
      -- Refresh cache for the affected date range
      IF v_date IS NOT NULL THEN
        PERFORM refresh_calendar_days_cache(
          v_family_id,
          v_date - INTERVAL '1 day',
          v_date + INTERVAL '1 day'
        );
      ELSE
        PERFORM refresh_calendar_days_cache(
          v_family_id,
          CURRENT_DATE,
          CURRENT_DATE + INTERVAL '90 days'
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- If the function doesn't exist or errors, silently continue
      -- This allows inserts to succeed even if cache refresh fails
      NULL;
    END;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Recreate the trigger with the fixed function
-- This will automatically refresh cache when overrides change
CREATE TRIGGER schedule_overrides_cache_trigger
  AFTER INSERT OR UPDATE OR DELETE ON schedule_overrides
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_calendar_cache();

-- Verify triggers
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'schedule_overrides'
ORDER BY trigger_name;

