-- =====================================================
-- PRE-MIGRATION CHECK
-- Run this FIRST to see what will be affected
-- This makes NO CHANGES, only reports
-- =====================================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '╔════════════════════════════════════════════════╗';
  RAISE NOTICE '║   PRE-MIGRATION ANALYSIS                       ║';
  RAISE NOTICE '║   This makes NO changes, only reports          ║';
  RAISE NOTICE '╚════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  
  -- =====================================================
  -- EVENT TABLES
  -- =====================================================
  RAISE NOTICE '📅 EVENT TABLES:';
  RAISE NOTICE '─────────────────────────────────────────────────';
  
  -- activity_instances
  BEGIN
    -- Check what columns exist first
    DECLARE
      has_child_id BOOLEAN;
      has_student_id BOOLEAN;
      child_col TEXT;
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'activity_instances' AND column_name = 'child_id'
      ) INTO has_child_id;
      
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'activity_instances' AND column_name = 'student_id'
      ) INTO has_student_id;
      
      IF has_child_id THEN
        child_col := 'child_id';
      ELSIF has_student_id THEN
        child_col := 'student_id';
      ELSE
        child_col := NULL;
      END IF;
      
      IF child_col IS NOT NULL THEN
        FOR rec IN EXECUTE format('
          SELECT 
            COUNT(*) as total,
            COUNT(DISTINCT family_id) as families,
            COUNT(DISTINCT %I) as children,
            MIN(scheduled_date) as earliest,
            MAX(scheduled_date) as latest
          FROM activity_instances', child_col)
        LOOP
          RAISE NOTICE 'activity_instances:';
          RAISE NOTICE '  └─ Total rows: %', rec.total;
          RAISE NOTICE '  └─ Families: %', rec.families;
          RAISE NOTICE '  └─ Children: %', rec.children;
          RAISE NOTICE '  └─ Date range: % to %', rec.earliest, rec.latest;
        END LOOP;
      ELSE
        FOR rec IN 
          SELECT 
            COUNT(*) as total,
            MIN(scheduled_date) as earliest,
            MAX(scheduled_date) as latest
          FROM activity_instances
        LOOP
          RAISE NOTICE 'activity_instances:';
          RAISE NOTICE '  └─ Total rows: %', rec.total;
          RAISE NOTICE '  └─ Date range: % to %', rec.earliest, rec.latest;
        END LOOP;
      END IF;
    END;
  EXCEPTION 
    WHEN undefined_table THEN
      RAISE NOTICE 'activity_instances: ❌ Table does not exist';
    WHEN OTHERS THEN
      RAISE NOTICE 'activity_instances: ⚠️  Error checking table: %', SQLERRM;
  END;
  
  -- activities
  BEGIN
    FOR rec IN 
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT activity_type) as types
      FROM activities
    LOOP
      RAISE NOTICE 'activities:';
      RAISE NOTICE '  └─ Total rows: %', rec.total;
      RAISE NOTICE '  └─ Activity types: %', rec.types;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'activities: ❌ Table does not exist';
  END;
  
  -- lessons
  BEGIN
    DECLARE
      has_child_id BOOLEAN;
      has_student_id BOOLEAN;
      child_col TEXT;
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'lessons' AND column_name = 'child_id'
      ) INTO has_child_id;
      
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'lessons' AND column_name = 'student_id'
      ) INTO has_student_id;
      
      IF has_child_id THEN
        child_col := 'child_id';
      ELSIF has_student_id THEN
        child_col := 'student_id';
      ELSE
        child_col := NULL;
      END IF;
      
      IF child_col IS NOT NULL THEN
        FOR rec IN EXECUTE format('
          SELECT 
            COUNT(*) as total,
            COUNT(DISTINCT %I) as children,
            MIN(start_ts::date) as earliest,
            MAX(start_ts::date) as latest
          FROM lessons', child_col)
        LOOP
          RAISE NOTICE 'lessons:';
          RAISE NOTICE '  └─ Total rows: %', rec.total;
          RAISE NOTICE '  └─ Children: %', rec.children;
          RAISE NOTICE '  └─ Date range: % to %', rec.earliest, rec.latest;
        END LOOP;
      ELSE
        FOR rec IN 
          SELECT 
            COUNT(*) as total,
            MIN(start_ts::date) as earliest,
            MAX(start_ts::date) as latest
          FROM lessons
        LOOP
          RAISE NOTICE 'lessons:';
          RAISE NOTICE '  └─ Total rows: %', rec.total;
          RAISE NOTICE '  └─ Date range: % to %', rec.earliest, rec.latest;
        END LOOP;
      END IF;
    END;
  EXCEPTION 
    WHEN undefined_table THEN
      RAISE NOTICE 'lessons: ❌ Table does not exist';
    WHEN OTHERS THEN
      RAISE NOTICE 'lessons: ⚠️  Error checking table: %', SQLERRM;
  END;
  
  -- events (current)
  BEGIN
    FOR rec IN 
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT source) as sources
      FROM events
    LOOP
      RAISE NOTICE 'events (current):';
      RAISE NOTICE '  └─ Total rows: %', rec.total;
      RAISE NOTICE '  └─ Sources: %', rec.sources;
    END LOOP;
    
    -- Show sources breakdown
    RAISE NOTICE '  └─ By source:';
    FOR rec IN 
      SELECT source, COUNT(*) as count
      FROM events
      GROUP BY source
      ORDER BY count DESC
    LOOP
      RAISE NOTICE '     ├─ %: % rows', rec.source, rec.count;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'events: ❌ Table does not exist (THIS IS A PROBLEM!)';
  END;
  
  RAISE NOTICE '';
  
  -- =====================================================
  -- ATTENDANCE TABLES
  -- =====================================================
  RAISE NOTICE '📊 ATTENDANCE TABLES:';
  RAISE NOTICE '─────────────────────────────────────────────────';
  
  -- old attendance
  BEGIN
    DECLARE
      has_child_id BOOLEAN;
      has_student_id BOOLEAN;
      child_col TEXT;
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'attendance' AND column_name = 'child_id'
      ) INTO has_child_id;
      
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'attendance' AND column_name = 'student_id'
      ) INTO has_student_id;
      
      IF has_child_id THEN
        child_col := 'child_id';
      ELSIF has_student_id THEN
        child_col := 'student_id';
      ELSE
        child_col := NULL;
      END IF;
      
      IF child_col IS NOT NULL THEN
        FOR rec IN EXECUTE format('
          SELECT 
            COUNT(*) as total,
            COUNT(DISTINCT %I) as children,
            MIN(date) as earliest,
            MAX(date) as latest
          FROM attendance', child_col)
        LOOP
          RAISE NOTICE 'attendance (old):';
          RAISE NOTICE '  └─ Total rows: %', rec.total;
          RAISE NOTICE '  └─ Children: %', rec.children;
          RAISE NOTICE '  └─ Date range: % to %', rec.earliest, rec.latest;
        END LOOP;
      ELSE
        FOR rec IN 
          SELECT 
            COUNT(*) as total,
            MIN(date) as earliest,
            MAX(date) as latest
          FROM attendance
        LOOP
          RAISE NOTICE 'attendance (old):';
          RAISE NOTICE '  └─ Total rows: %', rec.total;
          RAISE NOTICE '  └─ Date range: % to %', rec.earliest, rec.latest;
        END LOOP;
      END IF;
    END;
  EXCEPTION 
    WHEN undefined_table THEN
      RAISE NOTICE 'attendance: ❌ Table does not exist';
    WHEN OTHERS THEN
      RAISE NOTICE 'attendance: ⚠️  Error checking table: %', SQLERRM;
  END;
  
  -- attendance_log
  BEGIN
    FOR rec IN 
      SELECT COUNT(*) as total
      FROM attendance_log
    LOOP
      RAISE NOTICE 'attendance_log:';
      RAISE NOTICE '  └─ Total rows: %', rec.total;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'attendance_log: ❌ Table does not exist';
  END;
  
  -- attendance_records (current)
  BEGIN
    FOR rec IN 
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT child_id) as children,
        MIN(date) as earliest,
        MAX(date) as latest
      FROM attendance_records
    LOOP
      RAISE NOTICE 'attendance_records (current):';
      RAISE NOTICE '  └─ Total rows: %', rec.total;
      RAISE NOTICE '  └─ Children: %', rec.children;
      RAISE NOTICE '  └─ Date range: % to %', rec.earliest, rec.latest;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'attendance_records: ❌ Table does not exist (THIS IS A PROBLEM!)';
  END;
  
  RAISE NOTICE '';
  
  -- =====================================================
  -- TRACK TABLES
  -- =====================================================
  RAISE NOTICE '🎯 TRACK TABLES:';
  RAISE NOTICE '─────────────────────────────────────────────────';
  
  -- old track
  BEGIN
    FOR rec IN 
      SELECT COUNT(*) as total
      FROM track
    LOOP
      RAISE NOTICE 'track (old):';
      RAISE NOTICE '  └─ Total rows: %', rec.total;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'track: ❌ Table does not exist';
  END;
  
  -- subject_track (current)
  BEGIN
    FOR rec IN 
      SELECT COUNT(*) as total
      FROM subject_track
    LOOP
      RAISE NOTICE 'subject_track (current):';
      RAISE NOTICE '  └─ Total rows: %', rec.total;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'subject_track: ❌ Table does not exist';
  END;
  
  RAISE NOTICE '';
  
  -- =====================================================
  -- LEGACY TABLES
  -- =====================================================
  RAISE NOTICE '🗑️  LEGACY/UNUSED TABLES:';
  RAISE NOTICE '─────────────────────────────────────────────────';
  
  -- progress_logs
  BEGIN
    FOR rec IN SELECT COUNT(*) as total FROM progress_logs LOOP
      RAISE NOTICE 'progress_logs: % rows', rec.total;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'progress_logs: ❌ Table does not exist';
  END;
  
  -- checkpoints
  BEGIN
    FOR rec IN SELECT COUNT(*) as total FROM checkpoints LOOP
      RAISE NOTICE 'checkpoints: % rows', rec.total;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'checkpoints: ❌ Table does not exist';
  END;
  
  -- scheduling_constraints
  BEGIN
    FOR rec IN SELECT COUNT(*) as total FROM scheduling_constraints LOOP
      RAISE NOTICE 'scheduling_constraints: % rows', rec.total;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'scheduling_constraints: ❌ Table does not exist';
  END;
  
  -- lesson_instances
  BEGIN
    FOR rec IN SELECT COUNT(*) as total FROM lesson_instances LOOP
      RAISE NOTICE 'lesson_instances: % rows', rec.total;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'lesson_instances: ❌ Table does not exist';
  END;
  
  -- activity_logs
  BEGIN
    FOR rec IN SELECT COUNT(*) as total FROM activity_logs LOOP
      RAISE NOTICE 'activity_logs: % rows', rec.total;
    END LOOP;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'activity_logs: ❌ Table does not exist';
  END;
  
  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════════╗';
  RAISE NOTICE '║   ANALYSIS COMPLETE                            ║';
  RAISE NOTICE '╚════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE '📋 SUMMARY:';
  RAISE NOTICE '  ✅ Tables with data will be migrated';
  RAISE NOTICE '  ❌ Tables that do not exist will be skipped';
  RAISE NOTICE '  📦 All data will be backed up before changes';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 NEXT STEPS:';
  RAISE NOTICE '  1. Review the counts above';
  RAISE NOTICE '  2. If everything looks good, run:';
  RAISE NOTICE '     20251020_database_consolidation.sql';
  RAISE NOTICE '  3. Verify results with validation queries';
  RAISE NOTICE '';
END$$;

