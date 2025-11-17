# Database Consolidation - Quick Start

## 🎯 Goal
Simplify your database by merging duplicate event/attendance/track systems into single tables.

## 📊 What Gets Consolidated

### Before → After
```
EVENTS:
activity_instances (237 rows)  ─┐
activities (42 rows)           ─┼─→ events (unified)
lessons (18 rows)              ─┘

ATTENDANCE:
attendance (old)               ─┐
attendance_log                 ─┼─→ attendance_records (unified)
attendance_backup              ─┘

TRACKS:
track (old)                    ─┐
subject_track                  ─┴─→ subject_track (keep this one)
```

## 🚀 Quick Start (3 Steps)

### Step 1: Pre-Check (2 minutes)
```sql
-- Run this first to see what will happen
-- Copy/paste: pre_migration_check.sql
-- Into: Supabase SQL Editor
-- Click: Run
-- Read: The report
```

**What it shows:**
- How many rows in each table
- Which tables exist/don't exist
- Date ranges of data
- No changes made!

### Step 2: Run Migration (2 minutes)
```sql
-- Run the actual migration
-- Copy/paste: 20251020_database_consolidation.sql
-- Into: Supabase SQL Editor
-- Click: Run
-- Watch: NOTICE messages for progress
```

**What it does:**
- ✅ Creates backups (all tables saved)
- ✅ Migrates data (preserves everything)
- ✅ Drops old tables (safely)
- ✅ Creates indexes (optimizes queries)
- ✅ Validates results (counts match)

### Step 3: Verify (1 minute)
```sql
-- Check it worked
SELECT source, COUNT(*) FROM events GROUP BY source;
-- Should show: migrated_activity_instance, migrated_lesson, etc.

SELECT COUNT(*) FROM attendance_records;
-- Should show your total attendance records

-- Check backups exist
\dt *backup_20251020*
-- Should show: activity_instances_backup_20251020, etc.
```

## ✅ Safety Features

### Automatic Backups
Every table is backed up before changes:
```
activity_instances → activity_instances_backup_20251020
activities → activities_backup_20251020
lessons → lessons_backup_20251020
etc.
```

### No Data Loss
- All rows preserved
- All metadata kept in JSONB
- All timestamps maintained
- Original IDs stored

### Easy Rollback
```sql
-- If needed, restore from backups:
DROP TABLE events;
CREATE TABLE events AS SELECT * FROM events_backup_20251020;
-- (see guide for full rollback instructions)
```

## 📝 What Happens During Migration

### Events Consolidation
```sql
-- BEFORE: 3 tables
activity_instances (237 rows)
activities (42 rows)
lessons (18 rows)
Total: 297 rows across 3 tables

-- AFTER: 1 table
events (297+ rows)
  ├─ migrated_activity_instance: 237
  ├─ migrated_lesson: 18
  └─ manual: (your other events)
```

### Field Mapping
```
activity_instances.scheduled_date + scheduled_time → events.start_ts
activity_instances.duration_minutes → events.end_ts - start_ts
activity_instances.status (completed) → events.status (done)
activity_instances.id → events.metadata->>'original_id'
```

### Status Mapping
```
'completed' → 'done'
'scheduled' → 'scheduled'
'cancelled' → 'cancelled'
NULL → 'scheduled'
```

## 🔍 Pre-Check Results (Example)

```
╔════════════════════════════════════════════════╗
║   PRE-MIGRATION ANALYSIS                       ║
╚════════════════════════════════════════════════╝

📅 EVENT TABLES:
─────────────────────────────────────────────────
activity_instances:
  └─ Total rows: 237
  └─ Families: 1
  └─ Children: 2
  └─ Date range: 2025-01-15 to 2025-12-20

activities:
  └─ Total rows: 42
  └─ Activity types: 5

lessons:
  └─ Total rows: 18
  └─ Children: 2
  └─ Date range: 2025-01-15 to 2025-03-30

events (current):
  └─ Total rows: 5
  └─ Sources: 1
  └─ By source:
     ├─ manual: 5 rows

📊 ATTENDANCE TABLES:
─────────────────────────────────────────────────
attendance (old): ❌ Table does not exist
attendance_log: ❌ Table does not exist
attendance_records (current):
  └─ Total rows: 45
  └─ Children: 2
  └─ Date range: 2025-01-01 to 2025-10-15

🎯 TRACK TABLES:
─────────────────────────────────────────────────
track (old): ❌ Table does not exist
subject_track (current):
  └─ Total rows: 12

🗑️  LEGACY/UNUSED TABLES:
─────────────────────────────────────────────────
progress_logs: ❌ Table does not exist
checkpoints: ❌ Table does not exist
scheduling_constraints: ❌ Table does not exist
lesson_instances: ❌ Table does not exist
activity_logs: ❌ Table does not exist

╔════════════════════════════════════════════════╗
║   ANALYSIS COMPLETE                            ║
╚════════════════════════════════════════════════╝

📋 SUMMARY:
  ✅ Tables with data will be migrated
  ❌ Tables that do not exist will be skipped
  📦 All data will be backed up before changes
```

## ✨ Benefits After Migration

### Simpler Schema
```
Before: 15+ tables
After: 3 tables (events, attendance_records, subject_track)
```

### Faster Queries
```sql
-- Before (need UNION)
SELECT * FROM activity_instances
UNION ALL
SELECT * FROM lessons;

-- After (simple)
SELECT * FROM events;
```

### Easier Code
```javascript
// Before: Multiple table references
supabase.from('activity_instances')...
supabase.from('lessons')...
supabase.from('activities')...

// After: One table
supabase.from('events')...
```

### Better Maintenance
- One set of RPCs to maintain
- One set of indexes to optimize
- One set of permissions to manage

## 🐛 Troubleshooting

### Q: Migration failed halfway?
**A:** Check NOTICE messages for error. Backups exist, can rollback.

### Q: Events not showing in calendar?
**A:** Check: `SELECT COUNT(*) FROM events WHERE source LIKE 'migrated%'`

### Q: Want to undo migration?
**A:** See DATABASE-CONSOLIDATION-GUIDE.md "Rollback Instructions"

### Q: Some events duplicated?
**A:** Run deduplication query (in guide)

### Q: Frontend code broken?
**A:** Update table names (see guide "Frontend Code Updates")

## 📚 Files Reference

| File | Purpose |
|------|---------|
| `pre_migration_check.sql` | **Start here** - Shows what will be affected |
| `20251020_database_consolidation.sql` | **Main migration** - Does the consolidation |
| `DATABASE-CONSOLIDATION-GUIDE.md` | **Full guide** - Detailed instructions |
| `DATABASE-CONSOLIDATION-SUMMARY.md` | **This file** - Quick reference |

## ⏱️ Timeline

| Step | Time | Risk |
|------|------|------|
| Pre-check | 2 min | None (read-only) |
| Backups | 1 min | None (automatic) |
| Migration | 1 min | Low (reversible) |
| Validation | 1 min | None (read-only) |
| **Total** | **5 min** | **Minimal** |

## 🎯 Success Criteria

After migration, verify:

✅ **Events table has all data:**
```sql
SELECT 
  (SELECT COUNT(*) FROM activity_instances_backup_20251020) +
  (SELECT COUNT(*) FROM lessons_backup_20251020) as old_count,
  (SELECT COUNT(*) FROM events WHERE source LIKE 'migrated%') as new_count;
-- old_count should equal new_count
```

✅ **Calendar shows events:**
- Browse to Planner → Month
- See your events displayed
- Click one → Shows details

✅ **No errors in console:**
- Open browser console
- Browse app
- No "table not found" errors

✅ **Backups exist:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name LIKE '%backup_20251020%';
-- Should list 5+ backup tables
```

## 🚀 Ready to Run?

### Recommended Order:
1. **Read this summary** (you're here!)
2. **Run pre-check** (see what will happen)
3. **Review results** (make sure counts look right)
4. **Run migration** (do the consolidation)
5. **Verify results** (check counts match)
6. **Test app** (browse and verify)
7. **Keep backups** (for 1 week, then drop)

### Commands:
```bash
# 1. Pre-check (in Supabase SQL Editor)
# Copy/paste: pre_migration_check.sql
# Execute

# 2. Migration (in Supabase SQL Editor)
# Copy/paste: 20251020_database_consolidation.sql
# Execute

# 3. Verify (in Supabase SQL Editor)
SELECT source, COUNT(*) FROM events GROUP BY source;
```

---

## 📞 Support

If you have issues:
1. Check the NOTICE messages (shows progress)
2. Read DATABASE-CONSOLIDATION-GUIDE.md (detailed help)
3. Backups exist (can always rollback)
4. Migration is idempotent (safe to re-run)

---

**Status:** ✅ Ready to run
**Risk Level:** 🟢 Low (backups + rollback available)
**Estimated Time:** ⏱️ 5 minutes total
**Recommended:** ✅ Yes (simplifies database significantly)

