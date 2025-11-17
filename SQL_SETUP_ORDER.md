# SQL Setup Order - Complete Guide

Run these SQL files in Supabase SQL Editor in this exact order to avoid dependency errors.

## 📋 **Setup Checklist**

### **Phase 1: Core Tables & Functions** (Required First)
These must exist before anything else:

- [ ] Verify `get_child_availability` exists (from `create-availability-api.sql`)
  - If not, run `create-availability-api.sql` first
  - This is the foundation function that others depend on

### **Phase 2: Helper Functions**
Run these in order:

1. [ ] **`create-planner-helpers.sql`**
   - Creates: `rpc_perf_log` table
   - Creates: `_minutes_between`, `set_event_status`, `create_event_checked`, `quick_add_20min_review`
   - Dependencies: `events` table must exist

2. [ ] **`create-get-child-availability-helper.sql`**
   - Creates: `get_child_availability_windows` wrapper
   - Dependencies: `get_child_availability` must exist
   - Creates performance indexes

3. [ ] **`create-rules-helpers.sql`**
   - Creates: `reorder_rules`, `get_rules_for_ui`
   - Dependencies: `schedule_rules` table must exist

### **Phase 3: View RPCs**
Run these after helpers are created:

4. [ ] **`create-week-view-rpc.sql`**
   - Creates: `get_week_view`
   - Dependencies: `get_child_availability_windows` must exist

5. [ ] **`create-day-view-rpc.sql`**
   - Creates: `get_day_view`
   - Dependencies: `get_child_availability_windows` must exist

6. [ ] **`create-reschedule-event-rpc.sql`**
   - Creates: `reschedule_event_checked`
   - Dependencies: `calendar_days_cache` table must exist

### **Phase 4: Profile & Stories**
Run these last:

7. [ ] **`create-child-profile-rpc.sql`**
   - Creates: `child_prefs` table
   - Creates: `get_child_profile`
   - Dependencies: `subject_goals` table must exist

8. [ ] **`create-home-data-rpc.sql`**
   - Creates: `get_home_data`
   - Dependencies: All core tables must exist

9. [ ] **`create-day-stories-rpc.sql`**
   - Creates: `generate_day_stories`
   - Dependencies: `get_day_view` must exist

---

## 🔍 **Troubleshooting**

### **Error: "function does not exist"**
**Solution:** The dependency function hasn't been created yet. Check the order above.

### **Error: "table does not exist"**
**Solution:** Run the table creation scripts first:
- `create-calendar-tables-final.sql` or
- `database-migration-schedule-rules.sql`

### **Error: "permission denied"**
**Solution:** Add `SECURITY DEFINER` to the function or create proper RLS policies.

### **Error: "column does not exist"**
**Solution:** Your table schema differs. Check actual columns with:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'your_table_name';
```

---

## ✅ **Verification Queries**

After running all files, verify with:

```sql
-- Check all functions exist
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_child_availability',
    'get_child_availability_windows',
    'get_week_view',
    'get_day_view',
    'reschedule_event_checked',
    'get_child_profile',
    'get_home_data',
    'generate_day_stories',
    'reorder_rules',
    'get_rules_for_ui',
    'set_event_status',
    'create_event_checked',
    'quick_add_20min_review'
  )
ORDER BY routine_name;

-- Should return 13 functions

-- Test a simple call
SELECT get_week_view(
  'your-family-uuid'::uuid,
  '2025-10-06'::date,
  '2025-10-13'::date,
  NULL
);
```

---

## 🚀 **Quick Fix for Current Error**

The `get_week_view` error is likely because `get_child_availability_windows` doesn't exist yet.

**Run this first:**
```bash
# In Supabase SQL Editor:
1. Open create-get-child-availability-helper.sql
2. Run it
3. Verify: SELECT * FROM get_child_availability_windows('any-child-uuid', '2025-10-06', '2025-10-13');
4. Then run create-week-view-rpc.sql
```

If `get_child_availability` itself doesn't exist, run `create-availability-api.sql` first.
