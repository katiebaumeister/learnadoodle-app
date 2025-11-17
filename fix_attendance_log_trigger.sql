-- =====================================================
-- FIX ATTENDANCE_LOG TRIGGER ISSUE
-- Drop the trigger and function that reference deleted table
-- =====================================================

-- Drop the trigger
DROP TRIGGER IF EXISTS trigger_attendance_update ON events;
DROP TRIGGER IF EXISTS attendance_update_trigger ON events;

-- Drop the functions (CASCADE to drop dependent triggers)
DROP FUNCTION IF EXISTS update_attendance_log(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS trigger_attendance_update() CASCADE;

-- Create a simple do-nothing trigger function if needed
CREATE OR REPLACE FUNCTION trigger_attendance_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- This trigger was disabled because attendance_log table was consolidated
  -- into attendance_records. The functionality is now handled elsewhere.
  RETURN NEW;
END$$;

DO $$
BEGIN
  RAISE NOTICE '✅ Fixed attendance_log trigger issue';
  RAISE NOTICE '   - Dropped old trigger and function';
  RAISE NOTICE '   - Created no-op replacement function';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Now you can run: seed_max_lilly_schoolyear.sql';
END$$;

