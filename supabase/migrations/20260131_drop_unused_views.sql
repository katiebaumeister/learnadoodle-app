-- Migration: Drop unused SQL views
-- This migration drops views that are either unused or have been replaced by RPC functions
--
-- WARNING: This drops standards_coverage_analytics which IS currently used in the Records screen
-- (Gradebook & Mastery tab -> Standards section). Only run this if you're replacing it with
-- an RPC function or removing that feature.

DO $$
BEGIN
  -- Drop v_upload_stats view (backend exists but not used in UI)
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'v_upload_stats') THEN
    DROP VIEW IF EXISTS v_upload_stats CASCADE;
    RAISE NOTICE 'Dropped v_upload_stats view';
  ELSE
    RAISE NOTICE 'v_upload_stats view does not exist';
  END IF;

  -- Drop attendance_unified view (not used, replaced by get_child_attendance RPC)
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'attendance_unified') THEN
    DROP VIEW IF EXISTS attendance_unified CASCADE;
    RAISE NOTICE 'Dropped attendance_unified view';
  ELSE
    RAISE NOTICE 'attendance_unified view does not exist';
  END IF;

  -- Drop standards_coverage_analytics view
  -- ⚠️ WARNING: This view IS currently used in Records -> Gradebook & Mastery -> Standards tab
  -- Dropping this will break StandardsCoverageDashboard component
  -- Only drop if you're replacing it with an RPC function or removing that feature
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'standards_coverage_analytics') THEN
    DROP VIEW IF EXISTS standards_coverage_analytics CASCADE;
    RAISE NOTICE 'Dropped standards_coverage_analytics view (WARNING: This was in use!)';
  ELSE
    RAISE NOTICE 'standards_coverage_analytics view does not exist';
  END IF;

END $$;
