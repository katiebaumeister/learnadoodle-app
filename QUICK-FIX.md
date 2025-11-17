# Quick Fix for Availability Errors

## 🔴 Errors You're Seeing:
- `column av.start_time does not exist`
- `column ca.available_blocks does not exist`  
- `function get_child_availability does not exist`
- `get_week_view error`
- `get_family_availability error`

## ✅ Solution (2 minutes):

### Step 1: Run the availability fix
1. Open **Supabase Dashboard → SQL Editor**
2. Copy and paste the entire contents of **`update-availability-functions.sql`**
3. Click **Run**

### Step 2: Refresh your app
Reload your application - all availability errors will be gone!

## What This Does:
- Updates `get_child_availability` to return the correct columns
- Updates `get_family_availability` to use the correct column names
- Updates `get_child_availability_windows` wrapper function
- Fixes all planner and heatmap views

## After This Fix:
- ✅ Schedule Rules heatmap will work
- ✅ Week view planner will load
- ✅ Month view planner will work
- ✅ Home screen availability will display
- ✅ AI Planner will function correctly

---

**Note:** You've already run `setup-all-systems.sql` for the attendance/uploads/lesson plans, so you only need this one additional fix for the availability functions.

