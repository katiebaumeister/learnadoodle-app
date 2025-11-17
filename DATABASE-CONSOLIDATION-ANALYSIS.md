# Database Consolidation Analysis

## Current Table Structure (Estimated)

Based on the SQL files and code, you likely have:

### **Core Tables** (Essential - Keep)
1. `family` - Family/household records
2. `profiles` - User accounts linked to families
3. `children` - Student records
4. `events` - Scheduled calendar events
5. `calendar_days_cache` - Pre-computed availability

### **Scheduling Tables** (Keep)
6. `schedule_rules` - Recurring availability rules
7. `schedule_overrides` - One-time availability changes
8. `holidays` - Holiday definitions
9. `global_official_holidays` - System-wide holidays

### **Learning Content** (Keep - Newly Added)
10. `lesson_plans` - Lesson plan templates
11. `lesson_plan_steps` - Steps within plans
12. `child_plan_links` - Links plans to children/weeks
13. `learning_backlog` - Unscheduled tasks/goals
14. `uploads` - File/evidence library

### **Tracking** (Keep - Newly Added)
15. `attendance_records` - Attendance tracking
16. `subject_goals` - Learning goals per subject
17. `child_prefs` - Child preferences

### **Legacy/Redundant Tables** (Consolidation Candidates)

#### **Duplicate Event Systems**
- `activity_instances` ← **Can merge into `events`**
- `activities` ← **Can merge into templates or remove**
- `lessons` ← **Replaced by `lesson_plans`**

#### **Duplicate Track Systems**
- `track` ← **Consolidate with `subject_track`**
- `subject_track` ← **Keep this one**

#### **Old Attendance**
- `attendance` ← **Replaced by `attendance_records`**
- `attendance_backup` ← **Can delete**
- `attendance_log` ← **Maybe redundant with `attendance_records`**

#### **AI Tables** (If not used)
- `ai_conversations` ← **Keep only if using AI chat**
- `ai_messages` ← **Keep only if using AI chat**
- `ai_actions` ← **Keep only if using AI chat**
- `ai_plan_runs` ← **Probably not needed**

#### **Progress Tracking** (If unused)
- `progress_logs` ← **Consider if actually used**
- `checkpoints` ← **Consider if actually used**

#### **Calendar Helpers** (Redundant)
- `calendar_days` ← **Replaced by `calendar_days_cache`**
- `family_teaching_days` ← **Info now in `schedule_rules`**
- `class_day_mappings` ← **Probably not needed**

## 🎯 Recommended Consolidations

### **Priority 1: Merge Event Systems**

**Problem**: Multiple ways to represent scheduled items
- `events` (new system)
- `activity_instances` (old system)
- `lessons` (old system)

**Solution**: Use ONLY `events` table

**Migration**:
```sql
-- Move data from activity_instances to events
INSERT INTO events (
  family_id, child_id, subject_id, title, start_ts, end_ts, status, source, metadata
)
SELECT 
  family_id,
  child_id,
  subject_id,
  title,
  (scheduled_date || ' ' || scheduled_time)::TIMESTAMPTZ,
  (scheduled_date || ' ' || scheduled_time)::TIMESTAMPTZ + (duration_minutes || ' minutes')::INTERVAL,
  status,
  'migrated',
  jsonb_build_object('original_id', id, 'activity_type', activity_type)
FROM activity_instances
WHERE NOT EXISTS (
  SELECT 1 FROM events e WHERE e.metadata->>'original_id' = activity_instances.id::TEXT
);

-- Then drop old table
DROP TABLE activity_instances CASCADE;
DROP TABLE activities CASCADE;
DROP TABLE lessons CASCADE;
```

### **Priority 2: Consolidate Track Systems**

**Problem**: `track` and `subject_track` both exist

**Solution**: Keep `subject_track`, remove `track`

**Check first**:
```sql
-- See if track is actually used
SELECT COUNT(*) FROM track;
SELECT COUNT(*) FROM subject_track;
```

**If track is empty or unused**:
```sql
DROP TABLE track CASCADE;
```

### **Priority 3: Clean Up Old Attendance**

**Problem**: Multiple attendance tables

**Solution**: Keep ONLY `attendance_records`

**Migration**:
```sql
-- Move any data from old attendance table
INSERT INTO attendance_records (
  family_id, child_id, date, status, minutes_present, source
)
SELECT 
  family_id, child_id, date, status, minutes_present, 'migrated'
FROM attendance
WHERE NOT EXISTS (
  SELECT 1 FROM attendance_records ar 
  WHERE ar.child_id = attendance.child_id AND ar.date = attendance.date
);

-- Drop old tables
DROP TABLE attendance CASCADE;
DROP TABLE attendance_backup CASCADE;
DROP TABLE attendance_log CASCADE;
```

### **Priority 4: Remove Unused AI Tables**

**If not using AI conversations**:
```sql
DROP TABLE ai_plan_runs CASCADE;
DROP TABLE ai_actions CASCADE;
DROP TABLE ai_messages CASCADE;
DROP TABLE ai_conversations CASCADE;
```

**Keep if**: You want persistent AI chat history

### **Priority 5: Remove Unused Calendar Tables**

**Safe to remove**:
```sql
DROP TABLE calendar_days CASCADE; -- Replaced by calendar_days_cache
DROP TABLE family_teaching_days CASCADE; -- Replaced by schedule_rules
DROP TABLE class_day_mappings CASCADE; -- Not needed
```

### **Priority 6: Clean Up Progress/Checkpoints**

**Check usage first**:
```sql
SELECT COUNT(*) FROM progress_logs;
SELECT COUNT(*) FROM checkpoints;
SELECT COUNT(*) FROM scheduling_constraints;
```

**If unused**:
```sql
DROP TABLE progress_logs CASCADE;
DROP TABLE checkpoints CASCADE;
DROP TABLE scheduling_constraints CASCADE;
```

## 📊 Estimated Consolidation Impact

### **Before Consolidation**
- ~30-40 tables
- Multiple overlapping systems
- Confusing data model
- Higher maintenance

### **After Consolidation**
- ~20 tables
- Single source of truth per domain
- Clear data model
- Easier to understand

### **Core Tables After Cleanup** (20 tables)

**Identity & Organization** (4):
1. `family`
2. `profiles`
3. `children`
4. `family_years`

**Scheduling** (4):
5. `events` (consolidated from 3 tables)
6. `calendar_days_cache`
7. `schedule_rules`
8. `schedule_overrides`

**Reference Data** (3):
9. `holidays`
10. `global_official_holidays`
11. `subjects` (if exists, or merge into events)

**Learning Content** (5):
12. `lesson_plans`
13. `lesson_plan_steps`
14. `child_plan_links`
15. `learning_backlog`
16. `subject_track`

**Tracking** (3):
17. `attendance_records`
18. `subject_goals`
19. `child_prefs`

**Files** (1):
20. `uploads`

## 🔧 Safe Consolidation Script

Here's a safe, incremental consolidation:

```sql
-- ============================================================================
-- SAFE DATABASE CONSOLIDATION
-- Run these one at a time, checking after each
-- ============================================================================

-- Step 1: Check what exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Step 2: Remove obviously unused tables (run ONLY if they exist and are empty)
DROP TABLE IF EXISTS attendance_backup CASCADE;
DROP TABLE IF EXISTS calendar_days CASCADE;
DROP TABLE IF EXISTS class_day_mappings CASCADE;
DROP TABLE IF EXISTS family_teaching_days CASCADE;

-- Step 3: Consolidate old event system (ONLY if activity_instances exists)
-- First check if it has data:
-- SELECT COUNT(*) FROM activity_instances;
-- If empty or data already migrated:
-- DROP TABLE IF EXISTS activity_instances CASCADE;
-- DROP TABLE IF EXISTS activities CASCADE;

-- Step 4: Remove old attendance (ONLY if data already in attendance_records)
-- First check:
-- SELECT COUNT(*) FROM attendance;
-- SELECT COUNT(*) FROM attendance_records;
-- If old table is empty or migrated:
-- DROP TABLE IF EXISTS attendance CASCADE;

-- Step 5: Clean up AI tables (ONLY if not using AI chat)
-- DROP TABLE IF EXISTS ai_plan_runs CASCADE;
-- (Keep ai_conversations/ai_messages if you use Doodle chat)

-- Step 6: Remove progress tables if unused
-- First check:
-- SELECT COUNT(*) FROM progress_logs;
-- If empty:
-- DROP TABLE IF EXISTS progress_logs CASCADE;
-- DROP TABLE IF EXISTS checkpoints CASCADE;
```

## ⚠️ Important Notes

### **Don't Touch These Tables**
- ✅ `events` - Core calendar system
- ✅ `children` - Student records
- ✅ `family` - Household data
- ✅ `calendar_days_cache` - Performance critical
- ✅ `schedule_rules` - Availability engine
- ✅ `attendance_records` - New tracking system
- ✅ `uploads` - File library
- ✅ `lesson_plans` - New lesson system

### **Safe to Remove** (After Verification)
- ⚠️ `activity_instances` - If data migrated to `events`
- ⚠️ `activities` - If not used anymore
- ⚠️ `lessons` - If replaced by `lesson_plans`
- ⚠️ `attendance` (old) - If data in `attendance_records`
- ⚠️ `track` - If duplicates `subject_track`
- ⚠️ `calendar_days` - If replaced by `calendar_days_cache`

### **Maybe Keep**
- ❓ `ai_conversations` - If using Doodle chat
- ❓ `ai_messages` - If using Doodle chat
- ❓ `subject` - If separate from subjects in events
- ❓ `family_years` - If organizing by school year

## 🎯 Recommendation

### **Conservative Approach** (Recommended)
1. **Don't consolidate yet** - App is working
2. **Document current usage** - Understand what each table does
3. **Monitor for 1-2 weeks** - See what's actually used
4. **Then consolidate** - Remove only confirmed unused tables

### **Aggressive Approach** (If confident)
1. Backup database
2. Run consolidation script
3. Test all features
4. Rollback if issues

### **My Suggestion**
**Leave tables as-is for now.** You have a working app with all features. Consolidation is optimization, not a requirement. Focus on using the app, and consolidate later when you're sure what's not needed.

## 📋 Quick Check Commands

Run these in Supabase SQL Editor to see what you actually have:

```sql
-- See all your tables
SELECT table_name, 
       (SELECT COUNT(*) FROM information_schema.columns WHERE columns.table_name = tables.table_name) as column_count
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- See which tables have data
SELECT 'events' as table_name, COUNT(*) as row_count FROM events
UNION ALL SELECT 'activity_instances', COUNT(*) FROM activity_instances
UNION ALL SELECT 'lessons', COUNT(*) FROM lessons
UNION ALL SELECT 'attendance', COUNT(*) FROM attendance
UNION ALL SELECT 'attendance_records', COUNT(*) FROM attendance_records
UNION ALL SELECT 'uploads', COUNT(*) FROM uploads
UNION ALL SELECT 'lesson_plans', COUNT(*) FROM lesson_plans;
```

---

**Verdict**: You likely have 25-35 tables. Could consolidate to ~20, but **not urgent**. App works great as-is! 🎉

