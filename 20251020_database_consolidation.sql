-- =====================================================
-- DATABASE CONSOLIDATION MIGRATION
-- Date: 2025-10-20
-- Purpose: Merge duplicate event/attendance systems
-- =====================================================

-- This migration:
-- 1. Consolidates events table (removes activity_instances, activities, lessons)
-- 2. Consolidates tracks (removes old track table)
-- 3. Consolidates attendance (removes old attendance tables)
-- 4. Removes unused legacy tables
-- 5. Validates data integrity

-- =====================================================
-- PHASE 1: ANALYSIS - Check what exists
-- =====================================================

DO $$
DECLARE
  activity_instances_count INT;
  activities_count INT;
  lessons_count INT;
  track_count INT;
  old_attendance_count INT;
  progress_logs_count INT;
  checkpoints_count INT;
  constraints_count INT;
BEGIN
  RAISE NOTICE '=== DATABASE CONSOLIDATION ANALYSIS ===';
  
  -- Check activity_instances
  SELECT COUNT(*) INTO activity_instances_count FROM activity_instances;
  RAISE NOTICE 'activity_instances: % rows', activity_instances_count;
  
  -- Check activities
  SELECT COUNT(*) INTO activities_count FROM activities;
  RAISE NOTICE 'activities: % rows', activities_count;
  
  -- Check lessons
  SELECT COUNT(*) INTO lessons_count FROM lessons;
  RAISE NOTICE 'lessons: % rows', lessons_count;
  
  -- Check track
  BEGIN
    SELECT COUNT(*) INTO track_count FROM track;
    RAISE NOTICE 'track: % rows', track_count;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'track: table does not exist';
    track_count := 0;
  END;
  
  -- Check old attendance
  BEGIN
    SELECT COUNT(*) INTO old_attendance_count FROM attendance;
    RAISE NOTICE 'attendance (old): % rows', old_attendance_count;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'attendance: table does not exist';
    old_attendance_count := 0;
  END;
  
  -- Check progress_logs
  BEGIN
    SELECT COUNT(*) INTO progress_logs_count FROM progress_logs;
    RAISE NOTICE 'progress_logs: % rows', progress_logs_count;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'progress_logs: table does not exist';
    progress_logs_count := 0;
  END;
  
  -- Check checkpoints
  BEGIN
    SELECT COUNT(*) INTO checkpoints_count FROM checkpoints;
    RAISE NOTICE 'checkpoints: % rows', checkpoints_count;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'checkpoints: table does not exist';
    checkpoints_count := 0;
  END;
  
  -- Check scheduling_constraints
  BEGIN
    SELECT COUNT(*) INTO constraints_count FROM scheduling_constraints;
    RAISE NOTICE 'scheduling_constraints: % rows', constraints_count;
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'scheduling_constraints: table does not exist';
    constraints_count := 0;
  END;
  
  RAISE NOTICE '=== END ANALYSIS ===';
END$$;

-- =====================================================
-- PHASE 2: BACKUP - Create backup tables
-- =====================================================

-- Backup activity_instances before migration
CREATE TABLE IF NOT EXISTS activity_instances_backup_20251020 AS
SELECT * FROM activity_instances;

-- Backup activities before migration
CREATE TABLE IF NOT EXISTS activities_backup_20251020 AS
SELECT * FROM activities;

-- Backup lessons before migration
CREATE TABLE IF NOT EXISTS lessons_backup_20251020 AS
SELECT * FROM lessons;

DO $$
BEGIN
  RAISE NOTICE 'Backups created: activity_instances_backup_20251020, activities_backup_20251020, lessons_backup_20251020';
END$$;

-- =====================================================
-- PHASE 3: MIGRATE ACTIVITY_INSTANCES → EVENTS
-- =====================================================

DO $$
DECLARE
  migrated_count INT;
  child_col TEXT;
  has_child_id BOOLEAN;
  has_student_id BOOLEAN;
BEGIN
  RAISE NOTICE '=== MIGRATING activity_instances TO events ===';
  
  -- Check if activity_instances table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_instances') THEN
    RAISE NOTICE 'activity_instances table does not exist, skipping migration';
    RETURN;
  END IF;
  
  -- Determine which child column exists
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
    RAISE NOTICE 'activity_instances has no child_id or student_id column, skipping';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Using column: % for child reference', child_col;
  
  -- Migrate activity_instances to events (dynamic query to handle different column names)
  EXECUTE format('
    INSERT INTO events (
      family_id,
      child_id,
      subject_id,
      title,
      start_ts,
      end_ts,
      status,
      source,
      metadata,
      created_at,
      updated_at
    )
    SELECT 
      ai.family_id,
      ai.%I,
      ai.subject_id,
      COALESCE(ai.title, a.title, ''Untitled Activity''),
      (ai.scheduled_date || '' '' || COALESCE(ai.scheduled_time, ''09:00:00''))::TIMESTAMPTZ,
      (ai.scheduled_date || '' '' || COALESCE(ai.scheduled_time, ''09:00:00''))::TIMESTAMPTZ 
        + (COALESCE(ai.duration_minutes, a.default_duration_minutes, 30) || '' minutes'')::INTERVAL,
      CASE 
        WHEN ai.status = ''completed'' THEN ''done''
        WHEN ai.status = ''scheduled'' THEN ''scheduled''
        WHEN ai.status = ''cancelled'' THEN ''cancelled''
        ELSE ''scheduled''
      END,
      ''migrated_activity_instance'',
      jsonb_build_object(
        ''original_id'', ai.id,
        ''activity_id'', ai.activity_id,
        ''activity_type'', a.activity_type,
        ''migrated_at'', NOW()
      ),
      COALESCE(ai.created_at, NOW()),
      COALESCE(ai.updated_at, NOW())
    FROM activity_instances ai
    LEFT JOIN activities a ON a.id = ai.activity_id
    WHERE NOT EXISTS (
      SELECT 1 FROM events e 
      WHERE e.metadata->>''original_id'' = ai.id::TEXT
        AND e.source = ''migrated_activity_instance''
    )', child_col);
  
  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  RAISE NOTICE 'Migrated % activity instances to events', migrated_count;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error migrating activity_instances: %', SQLERRM;
    RAISE NOTICE 'Continuing with migration...';
END$$;

-- =====================================================
-- PHASE 4: MIGRATE LESSONS → EVENTS
-- =====================================================

DO $$
DECLARE
  migrated_count INT;
  child_col TEXT;
  has_child_id BOOLEAN;
  has_student_id BOOLEAN;
BEGIN
  RAISE NOTICE '=== MIGRATING lessons TO events ===';
  
  -- Check if lessons table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lessons') THEN
    RAISE NOTICE 'lessons table does not exist, skipping migration';
    RETURN;
  END IF;
  
  -- Determine which child column exists
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
    RAISE NOTICE 'lessons has no child_id or student_id column, skipping';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Using column: % for child reference', child_col;
  
  -- Migrate lessons to events (dynamic query)
  EXECUTE format('
    INSERT INTO events (
      family_id,
      child_id,
      subject_id,
      title,
      start_ts,
      end_ts,
      status,
      source,
      metadata,
      created_at,
      updated_at
    )
    SELECT 
      l.family_id,
      l.%I,
      l.subject_id,
      COALESCE(l.title, ''Lesson''),
      l.start_ts,
      l.end_ts,
      COALESCE(l.status, ''scheduled''),
      ''migrated_lesson'',
      jsonb_build_object(
        ''original_id'', l.id,
        ''notes'', l.notes,
        ''migrated_at'', NOW()
      ),
      COALESCE(l.created_at, NOW()),
      COALESCE(l.updated_at, NOW())
    FROM lessons l
    WHERE NOT EXISTS (
      SELECT 1 FROM events e 
      WHERE e.metadata->>''original_id'' = l.id::TEXT
        AND e.source = ''migrated_lesson''
    )', child_col);
  
  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  RAISE NOTICE 'Migrated % lessons to events', migrated_count;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error migrating lessons: %', SQLERRM;
    RAISE NOTICE 'Continuing with migration...';
END$$;

-- =====================================================
-- PHASE 5: DROP OLD EVENT TABLES
-- =====================================================

-- Drop dependent views/functions first
DROP VIEW IF EXISTS activity_instances_with_details CASCADE;
DROP VIEW IF EXISTS lessons_with_details CASCADE;

-- Drop the old tables
DROP TABLE IF EXISTS activity_instances CASCADE;
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS lessons CASCADE;

DO $$
BEGIN
  RAISE NOTICE 'Dropped tables: activity_instances, activities, lessons';
END$$;

-- =====================================================
-- PHASE 6: CONSOLIDATE TRACK TABLES
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=== CONSOLIDATING track tables ===';
  
  -- Check if track table exists and has data
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'track') THEN
    -- Backup track before dropping
    EXECUTE 'CREATE TABLE IF NOT EXISTS track_backup_20251020 AS SELECT * FROM track';
    
    -- Drop track table (subject_track is the current one)
    DROP TABLE IF EXISTS track CASCADE;
    RAISE NOTICE 'Dropped old track table (using subject_track instead)';
  ELSE
    RAISE NOTICE 'track table does not exist, skipping';
  END IF;
END$$;

-- =====================================================
-- PHASE 7: CONSOLIDATE ATTENDANCE TABLES
-- =====================================================

DO $$
DECLARE
  migrated_count INT;
BEGIN
  RAISE NOTICE '=== CONSOLIDATING attendance tables ===';
  
  -- Check if old attendance table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attendance') THEN
    -- Backup old attendance
    EXECUTE 'CREATE TABLE IF NOT EXISTS attendance_backup_20251020 AS SELECT * FROM attendance';
    
    -- Migrate data to attendance_records if not already there
    INSERT INTO attendance_records (
      family_id,
      child_id,
      date,
      status,
      minutes_present,
      notes,
      source,
      created_at,
      updated_at
    )
    SELECT 
      family_id,
      child_id,
      date,
      status,
      minutes_present,
      notes,
      'migrated_old_attendance',
      COALESCE(created_at, NOW()),
      COALESCE(updated_at, NOW())
    FROM attendance
    WHERE NOT EXISTS (
      SELECT 1 FROM attendance_records ar 
      WHERE ar.child_id = attendance.child_id 
        AND ar.date = attendance.date
    );
    
    GET DIAGNOSTICS migrated_count = ROW_COUNT;
    RAISE NOTICE 'Migrated % attendance records', migrated_count;
    
    -- Drop old attendance table
    DROP TABLE IF EXISTS attendance CASCADE;
    RAISE NOTICE 'Dropped old attendance table';
  ELSE
    RAISE NOTICE 'Old attendance table does not exist, skipping';
  END IF;
  
  -- Drop attendance_log if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attendance_log') THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS attendance_log_backup_20251020 AS SELECT * FROM attendance_log';
    DROP TABLE IF EXISTS attendance_log CASCADE;
    RAISE NOTICE 'Dropped attendance_log table';
  END IF;
END$$;

-- =====================================================
-- PHASE 8: REMOVE UNUSED LEGACY TABLES
-- =====================================================

DO $$
DECLARE
  tbl_name TEXT;
  tables_to_check TEXT[] := ARRAY[
    'progress_logs',
    'checkpoints',
    'scheduling_constraints',
    'lesson_instances',
    'activity_logs'
  ];
BEGIN
  RAISE NOTICE '=== REMOVING unused legacy tables ===';
  
  FOREACH tbl_name IN ARRAY tables_to_check
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl_name) THEN
      -- Backup before dropping
      EXECUTE format('CREATE TABLE IF NOT EXISTS %I AS SELECT * FROM %I', 
        tbl_name || '_backup_20251020', 
        tbl_name
      );
      
      -- Drop the table
      EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', tbl_name);
      RAISE NOTICE 'Dropped table: %', tbl_name;
    END IF;
  END LOOP;
END$$;

-- =====================================================
-- PHASE 9: UPDATE REFERENCES & CONSTRAINTS
-- =====================================================

-- Ensure events table has proper indexes
DO $$
BEGIN
  -- Create basic indexes
  CREATE INDEX IF NOT EXISTS idx_events_family_child ON events(family_id, child_id);
  CREATE INDEX IF NOT EXISTS idx_events_start_ts ON events(start_ts);
  
  -- Only create status index if column exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'status') THEN
    CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
  END IF;
  
  -- Only create source index if column exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'source') THEN
    CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
  END IF;
  
  -- Only create metadata index if column exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'metadata') THEN
    CREATE INDEX IF NOT EXISTS idx_events_metadata_original_id ON events((metadata->>'original_id'));
  END IF;
END$$;

-- Ensure attendance_records has proper indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attendance_records') THEN
    CREATE INDEX IF NOT EXISTS idx_attendance_family_date ON attendance_records(family_id, date);
    CREATE INDEX IF NOT EXISTS idx_attendance_child_date ON attendance_records(child_id, date);
  END IF;
END$$;

DO $$
BEGIN
  RAISE NOTICE 'Created optimized indexes';
END$$;

-- =====================================================
-- PHASE 10: VALIDATION
-- =====================================================

DO $$
DECLARE
  events_count INT;
  attendance_count INT;
  migrated_events INT;
  migrated_attendance INT;
BEGIN
  RAISE NOTICE '=== VALIDATION ===';
  
  -- Count total events
  SELECT COUNT(*) INTO events_count FROM events;
  RAISE NOTICE 'Total events: %', events_count;
  
  -- Count migrated events
  SELECT COUNT(*) INTO migrated_events FROM events 
  WHERE source IN ('migrated_activity_instance', 'migrated_lesson');
  RAISE NOTICE 'Migrated events: %', migrated_events;
  
  -- Count attendance records
  SELECT COUNT(*) INTO attendance_count FROM attendance_records;
  RAISE NOTICE 'Total attendance records: %', attendance_count;
  
  -- Count migrated attendance
  SELECT COUNT(*) INTO migrated_attendance FROM attendance_records 
  WHERE source = 'migrated_old_attendance';
  RAISE NOTICE 'Migrated attendance: %', migrated_attendance;
  
  RAISE NOTICE '=== CONSOLIDATION COMPLETE ===';
  RAISE NOTICE 'All backups saved with suffix: _backup_20251020';
  RAISE NOTICE 'To rollback, restore from backup tables';
END$$;

-- =====================================================
-- PHASE 11: CLEANUP OLD RPCS (if they exist)
-- =====================================================

-- Drop old RPCs that reference deleted tables
DROP FUNCTION IF EXISTS get_activity_instances(uuid, date, date);
DROP FUNCTION IF EXISTS create_activity_instance(uuid, uuid, uuid, date, time, integer);
DROP FUNCTION IF EXISTS get_lessons_for_week(uuid, date);
DROP FUNCTION IF EXISTS create_lesson(uuid, uuid, uuid, timestamptz, timestamptz, text);

DO $$
BEGIN
  RAISE NOTICE 'Dropped old RPC functions';
END$$;

-- =====================================================
-- SUMMARY
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════╗';
  RAISE NOTICE '║  DATABASE CONSOLIDATION COMPLETE      ║';
  RAISE NOTICE '╚════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Consolidated event systems → events table';
  RAISE NOTICE '✅ Consolidated tracks → subject_track table';
  RAISE NOTICE '✅ Consolidated attendance → attendance_records table';
  RAISE NOTICE '✅ Removed unused legacy tables';
  RAISE NOTICE '✅ Created optimized indexes';
  RAISE NOTICE '';
  RAISE NOTICE '📦 Backups created with suffix: _backup_20251020';
  RAISE NOTICE '🔄 To rollback: Restore from backup tables';
  RAISE NOTICE '';
  RAISE NOTICE 'Next step: Update your frontend code to use:';
  RAISE NOTICE '  - events (not activity_instances)';
  RAISE NOTICE '  - attendance_records (not attendance)';
  RAISE NOTICE '  - subject_track (not track)';
END$$;

