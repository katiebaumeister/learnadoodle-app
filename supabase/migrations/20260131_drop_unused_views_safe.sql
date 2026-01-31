-- Migration: Drop only unused SQL views (safe version)
-- This migration drops only views that are confirmed unused
-- Keeps standards_coverage_analytics which is actively used in Records screen

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

  -- NOTE: standards_coverage_analytics is NOT dropped here because it's actively used
  -- in Records -> Gradebook & Mastery -> Standards tab
  -- Use 20260131_drop_unused_views.sql if you want to drop it too

END $$;
