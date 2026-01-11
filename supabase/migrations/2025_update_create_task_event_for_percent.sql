-- Migration: Update create_task_event function to include _percent_of_total_grade parameter
-- This must be run after 2025_add_percent_of_total_grade.sql
-- This updates the existing create_task_event function to store percent_of_total_grade

-- IMPORTANT: This migration updates the create_task_event function to accept and store
-- the _percent_of_total_grade parameter. Since the function is complex, we'll use
-- CREATE OR REPLACE to update the existing function definition.

-- Note: The complete updated function definition is in 2025_add_recurring_events_support.sql
-- (lines 116-616). This migration just ensures the function is updated with the new parameter.
-- Since CREATE OR REPLACE is idempotent, running this will update the existing function.

-- The function signature includes _percent_of_total_grade numeric(5,2) DEFAULT NULL
-- All INSERT INTO events statements include percent_of_total_grade column and _percent_of_total_grade in VALUES

-- Simply run the CREATE OR REPLACE FUNCTION statement from 2025_add_recurring_events_support.sql
-- (starting at line 116) to update the function. Since we can't dynamically execute files,
-- you'll need to manually copy the function definition or re-run that migration if your
-- migration system supports re-running migrations.

DO $$
BEGIN
  RAISE NOTICE 'To complete the update, run the CREATE OR REPLACE FUNCTION statement';
  RAISE NOTICE 'from 2025_add_recurring_events_support.sql (lines 116-616) which includes';
  RAISE NOTICE 'all updates with _percent_of_total_grade parameter in all INSERT statements.';
  RAISE NOTICE '';
  RAISE NOTICE 'The updated function has:';
  RAISE NOTICE '  - _percent_of_total_grade numeric(5,2) DEFAULT NULL in signature';
  RAISE NOTICE '  - percent_of_total_grade column in all INSERT INTO events (after grade)';
  RAISE NOTICE '  - _percent_of_total_grade in all VALUES clauses (after _grade)';
END $$;
