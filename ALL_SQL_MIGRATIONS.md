# All SQL Migrations Required

## Run These SQL Files in Supabase SQL Editor

### 1. Capacity RPC (NEW - Required for Reports KPI)
**File**: `create_capacity_rpc.sql`
- Creates `get_capacity` RPC function
- Returns scheduled vs available minutes for family/week
- Used by Reports KPI row

### 2. Previous Migrations (Should Already Exist)
These should have been run previously, but verify they exist:

- **`flexible_tasks_and_syllabus_system.sql`**
  - Creates tables: `syllabi`, `syllabus_sections`, `plan_suggestions`, `backlog_items`
  - Alters `events` table (adds flexible task columns)
  - Alters `uploads` table (adds kind, subject_id, child_id)
  - Creates `v_upload_stats` view
  - Creates `subject_doc_targets` table
  - Creates `school_years`, `year_subjects` tables

- **`flexible_tasks_and_syllabus_rpcs.sql`**
  - Creates `get_flexible_backlog` RPC
  - Creates `compute_free_gaps` RPC
  - Creates `find_slot_for_flexible` RPC
  - Creates `get_light_evidence_subjects` RPC
  - Creates `done_vs_scheduled` RPC
  - Creates `compare_to_syllabus_week` RPC
  - Creates `bootstrap_next_year` RPC

- **`migrate_attendance_records_to_sparse.sql`**
  - Creates `attendance_exceptions` table
  - Creates `get_child_attendance` RPC (with SECURITY DEFINER)

- **`migrate_calendar_days_to_rules.sql`**
  - Creates `schedule_rules` and `schedule_overrides` tables
  - Creates `get_calendar_day_status` RPC
  - Creates `refresh_calendar_days_cache` function

- **`create-home-data-rpc.sql`**
  - Creates `get_home_data` RPC

- **`align_all_timezones.sql`**
  - Creates `get_family_timezone` function
  - Updates `get_week_view` and `get_month_view` RPCs

- **`create_subject_goals_rpc.sql`**
  - Creates `get_child_active_goals_count` RPC
  - Creates `get_child_active_goals` RPC

---

## Quick Verification Queries

Run these to verify RPCs exist:

```sql
-- Check if get_capacity exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'get_capacity';

-- Check if get_flexible_backlog exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'get_flexible_backlog';

-- Check if compare_to_syllabus_week exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'compare_to_syllabus_week';

-- Check if get_light_evidence_subjects exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'get_light_evidence_subjects';

-- Check if find_slot_for_flexible exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'find_slot_for_flexible';
```

---

## Execution Order

1. **First**: Run `create_capacity_rpc.sql` (new)
2. **Verify**: Check that all previous migrations were run
3. **If missing**: Run any missing migrations from the list above

---

## Notes

- All RPCs should have `SECURITY DEFINER` and `SET search_path = public` to bypass RLS
- All RPCs should grant `EXECUTE` to `authenticated` and `anon` roles
- The `get_capacity` RPC is new and required for the Reports KPI feature

