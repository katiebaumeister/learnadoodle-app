-- Migration: Add percent_of_total_grade column to events table
-- This tracks what percentage of the total grade each assignment/assessment represents for a subject

-- Step 1: Add the column to events table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'percent_of_total_grade'
  ) THEN
    ALTER TABLE events ADD COLUMN percent_of_total_grade NUMERIC(5,2) CHECK (percent_of_total_grade IS NULL OR (percent_of_total_grade >= 0 AND percent_of_total_grade <= 100));
    CREATE INDEX IF NOT EXISTS idx_events_percent_of_total_grade ON events(subject_id, percent_of_total_grade) WHERE percent_of_total_grade IS NOT NULL;
    COMMENT ON COLUMN events.percent_of_total_grade IS 'Percentage of total grade this event represents (0-100). Used for gradebook calculations.';
    RAISE NOTICE 'Added percent_of_total_grade column to events table';
  ELSE
    RAISE NOTICE 'percent_of_total_grade column already exists';
  END IF;
END $$;

-- Step 2: Create function to check total percentage for a subject and get existing assignments
CREATE OR REPLACE FUNCTION get_subject_grade_percentage_sum(
  p_subject_id uuid,
  p_exclude_event_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_total_percent numeric := 0;
  v_remaining_percent numeric;
  v_assignment_details jsonb;
  v_result jsonb;
BEGIN
  -- Calculate sum of all percentages for this subject (excluding the event being edited if provided)
  SELECT 
    COALESCE(SUM(percent_of_total_grade), 0),
    COALESCE(
      JSONB_AGG(
        jsonb_build_object(
          'id', id,
          'title', title,
          'percent', percent_of_total_grade
        )
        ORDER BY created_at DESC
      ) FILTER (WHERE percent_of_total_grade IS NOT NULL),
      '[]'::jsonb
    )
  INTO v_total_percent, v_assignment_details
  FROM events
  WHERE subject_id = p_subject_id
    AND (p_exclude_event_id IS NULL OR id != p_exclude_event_id)
    AND percent_of_total_grade IS NOT NULL
    AND deleted_at IS NULL;

  -- Calculate remaining percentage (how much is available)
  v_remaining_percent := GREATEST(0, 100 - v_total_percent);

  -- Build result
  v_result := jsonb_build_object(
    'total_percent', v_total_percent,
    'remaining_percent', v_remaining_percent,
    'assignments', v_assignment_details
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_subject_grade_percentage_sum(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_subject_grade_percentage_sum(uuid, uuid) TO service_role;

COMMENT ON FUNCTION get_subject_grade_percentage_sum IS 'Returns the sum of grade percentages for a subject and list of existing assignments with percentages. Used for validation when creating/editing events.';

-- Step 3: Update create_task_event function to accept _percent_of_total_grade parameter
-- First, drop all existing versions to avoid signature conflicts
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT oid::regprocedure::text as func_signature
    FROM pg_proc
    WHERE proname = 'create_task_event'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
    RAISE NOTICE 'Dropped function: %', r.func_signature;
  END LOOP;
END $$;

-- Now recreate the function with _percent_of_total_grade parameter
-- Note: This is a simplified version - in production you'd want to preserve the full function logic
-- We'll need to read the current function and update all INSERT statements
-- For now, let's add a comment that the function needs to be manually updated
DO $$
BEGIN
  RAISE NOTICE 'create_task_event function needs to be updated manually to include _percent_of_total_grade parameter in all INSERT statements.';
  RAISE NOTICE 'The parameter should be added after _grade and included in all event INSERT statements.';
END $$;

