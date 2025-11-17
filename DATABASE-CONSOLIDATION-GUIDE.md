# Database Consolidation Guide

## Overview
This migration consolidates duplicate event, attendance, and track systems into single tables.

## What Gets Consolidated

### ✅ Event Systems → `events` table
- ❌ `activity_instances` (old) → ✅ `events` (new)
- ❌ `activities` (old) → ✅ `events` (new)
- ❌ `lessons` (old) → ✅ `events` (new)

### ✅ Track Systems → `subject_track` table
- ❌ `track` (old) → ✅ `subject_track` (new)

### ✅ Attendance Systems → `attendance_records` table
- ❌ `attendance` (old) → ✅ `attendance_records` (new)
- ❌ `attendance_log` (old) → ✅ `attendance_records` (new)
- ❌ `attendance_backup` (old) → ✅ `attendance_records` (new)

### ✅ Removed Unused Tables
- ❌ `progress_logs` (unused)
- ❌ `checkpoints` (unused)
- ❌ `scheduling_constraints` (unused)
- ❌ `lesson_instances` (unused)
- ❌ `activity_logs` (unused)

## Safety Features

### 🛡️ Automatic Backups
Before dropping any table, the migration creates a backup:
```
activity_instances → activity_instances_backup_20251020
activities → activities_backup_20251020
lessons → lessons_backup_20251020
attendance → attendance_backup_20251020
track → track_backup_20251020
etc.
```

### 🔍 Analysis Phase
The migration first analyzes what exists and reports:
```
activity_instances: 237 rows
activities: 42 rows
lessons: 18 rows
track: 0 rows (empty, can be safely dropped)
attendance: 0 rows (empty, can be safely dropped)
```

### ✅ Data Integrity
- Checks for existing migrated data (won't duplicate)
- Preserves all metadata in JSONB fields
- Maintains timestamps (created_at, updated_at)
- Maps statuses correctly

## Running the Migration

### Step 1: Review the Analysis (Dry Run)
```sql
-- Run just the analysis phase to see what will be affected
-- Copy lines 13-74 from 20251020_database_consolidation.sql
-- This shows you what data exists WITHOUT making changes
```

### Step 2: Run the Full Migration
```sql
-- In Supabase SQL Editor:
-- 1. Copy entire contents of 20251020_database_consolidation.sql
-- 2. Paste into SQL Editor
-- 3. Click "Run"
-- 4. Watch the NOTICE messages for progress
```

### Step 3: Verify Results
```sql
-- Check events table
SELECT 
  source,
  COUNT(*) as count
FROM events
GROUP BY source
ORDER BY count DESC;

-- Should see:
-- migrated_activity_instance: 237
-- migrated_lesson: 18
-- manual: (your manually created events)

-- Check attendance
SELECT COUNT(*) FROM attendance_records;
-- Should match your old attendance count

-- Verify backups exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_name LIKE '%backup_20251020%';
-- Should list all backup tables
```

## Migration Details

### Activity Instances → Events
Maps fields as follows:
```sql
activity_instances                → events
------------------                   ------
id                                → metadata->'original_id'
family_id                         → family_id
child_id                          → child_id
subject_id                        → subject_id
title                             → title
scheduled_date + scheduled_time   → start_ts
(+ duration_minutes)              → end_ts
status (completed/scheduled)      → status (done/scheduled)
activity_id                       → metadata->'activity_id'
activity_type                     → metadata->'activity_type'
```

### Lessons → Events
Maps fields as follows:
```sql
lessons        → events
-------           ------
id             → metadata->'original_id'
family_id      → family_id
child_id       → child_id
subject_id     → subject_id
title          → title
start_ts       → start_ts
end_ts         → end_ts
status         → status
notes          → metadata->'notes'
```

### Status Mapping
```sql
-- Old status → New status
'completed'    → 'done'
'scheduled'    → 'scheduled'
'cancelled'    → 'cancelled'
'in_progress'  → 'in_progress'
NULL           → 'scheduled' (default)
```

## Rollback Instructions

If you need to rollback:

### Option A: Restore from Backup Tables
```sql
-- Restore activity_instances
DROP TABLE IF EXISTS activity_instances;
CREATE TABLE activity_instances AS 
SELECT * FROM activity_instances_backup_20251020;

-- Restore activities
DROP TABLE IF EXISTS activities;
CREATE TABLE activities AS 
SELECT * FROM activities_backup_20251020;

-- Restore lessons
DROP TABLE IF EXISTS lessons;
CREATE TABLE lessons AS 
SELECT * FROM lessons_backup_20251020;

-- Remove migrated events
DELETE FROM events 
WHERE source IN ('migrated_activity_instance', 'migrated_lesson');
```

### Option B: Keep Both Systems Temporarily
```sql
-- Don't drop the backup tables
-- Keep them for reference while testing
-- Query both old and new:

SELECT * FROM activity_instances_backup_20251020;
SELECT * FROM events WHERE source = 'migrated_activity_instance';
```

## Frontend Code Updates

After migration, update your code to use the new tables:

### Events (instead of activity_instances)
```javascript
// OLD
const { data } = await supabase
  .from('activity_instances')
  .select('*')
  .eq('child_id', childId);

// NEW
const { data } = await supabase
  .from('events')
  .select('*')
  .eq('child_id', childId);
```

### Attendance (instead of old attendance)
```javascript
// OLD
const { data } = await supabase
  .from('attendance')
  .select('*')
  .eq('child_id', childId);

// NEW (already using this!)
const { data } = await supabase
  .from('attendance_records')
  .select('*')
  .eq('child_id', childId);
```

### Subject Track (instead of track)
```javascript
// OLD
const { data } = await supabase
  .from('track')
  .select('*');

// NEW
const { data } = await supabase
  .from('subject_track')
  .select('*');
```

## What to Check After Migration

### ✅ Checklist

1. **Event Counts Match**
   ```sql
   -- Old total
   SELECT 
     (SELECT COUNT(*) FROM activity_instances_backup_20251020) +
     (SELECT COUNT(*) FROM lessons_backup_20251020) as old_total;
   
   -- New total
   SELECT COUNT(*) FROM events 
   WHERE source IN ('migrated_activity_instance', 'migrated_lesson');
   
   -- Should match!
   ```

2. **Calendar Shows Events**
   - Go to Planner → Month view
   - Should see all your events
   - Check that dates/times are correct

3. **Attendance Records Present**
   ```sql
   SELECT * FROM attendance_records 
   ORDER BY date DESC 
   LIMIT 10;
   ```

4. **No 404 Errors**
   - Browse app, check console
   - Should see no "table not found" errors

5. **Backups Exist**
   ```sql
   \dt *backup_20251020*
   ```

## Benefits After Migration

### 🎯 Simpler Schema
- One events table (not 3)
- One attendance table (not 3)
- One track table (not 2)

### 🚀 Better Performance
- Fewer joins needed
- Optimized indexes on single table
- Simpler queries

### 🧹 Cleaner Code
- One set of RPCs to maintain
- Consistent field names
- Less confusion about which table to use

### 📊 Easier Analytics
```sql
-- Before (need UNION)
SELECT * FROM activity_instances
UNION ALL
SELECT * FROM lessons;

-- After (simple query)
SELECT * FROM events;
```

## Troubleshooting

### Issue: "Column doesn't exist"
**Cause**: Old code still referencing old tables
**Fix**: Update code to use new table names

### Issue: "Events not showing in calendar"
**Cause**: Migration didn't complete
**Fix**: Check NOTICE messages, re-run migration

### Issue: "Duplicate events"
**Cause**: Migration ran twice
**Fix**: 
```sql
-- Remove duplicates
DELETE FROM events e1
WHERE EXISTS (
  SELECT 1 FROM events e2
  WHERE e2.metadata->>'original_id' = e1.metadata->>'original_id'
    AND e2.source = e1.source
    AND e2.id < e1.id
);
```

### Issue: "Want to undo migration"
**Fix**: See "Rollback Instructions" above

## Next Steps

After successful migration:

1. **Test thoroughly** - Browse entire app
2. **Monitor for errors** - Check console logs
3. **Wait 1 week** - Keep backup tables for 7 days
4. **Drop backups** (after 1 week):
   ```sql
   DROP TABLE activity_instances_backup_20251020;
   DROP TABLE activities_backup_20251020;
   DROP TABLE lessons_backup_20251020;
   DROP TABLE attendance_backup_20251020;
   DROP TABLE track_backup_20251020;
   -- etc.
   ```

## Summary

**Before**: 15+ event/attendance/track tables
**After**: 3 main tables (events, attendance_records, subject_track)

**Data Loss**: ❌ None (all migrated with backups)
**Downtime**: ❌ None (migration runs in seconds)
**Rollback**: ✅ Easy (restore from backups)

**Status**: ✅ Ready to run!

---

**Run the migration when you're ready:**
```bash
# Copy 20251020_database_consolidation.sql to Supabase SQL Editor
# Execute and watch the NOTICE messages
# Verify results with queries above
```

