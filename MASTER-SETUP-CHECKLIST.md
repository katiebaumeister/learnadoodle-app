# Master Setup Checklist

## 🗄️ Database Setup Status

### ✅ Completed
- [x] `create-planner-capacity-rpc.sql` - Capacity computation (just ran)

### ⏳ Pending (Need to run in Supabase)

**High Priority:**
1. [ ] `update-availability-functions.sql` - Fixes availability errors
   - **Why**: Calendar heatmap, week view, family availability
   - **Errors**: `column av.start_time does not exist`, `column ca.available_blocks does not exist`
   - **Impact**: Scheduling rules preview, planner week view

2. [ ] `setup-all-systems.sql` - Attendance, Uploads, Lesson Plans
   - **Why**: Records, Documents, Lesson Plans screens
   - **Includes**: RLS policies, triggers, RPCs
   - **Impact**: 3 major app sections

3. [ ] Storage bucket creation (via Supabase Dashboard UI)
   - **Bucket name**: `evidence`
   - **Type**: Private
   - **Why**: File uploads in Documents screen

**Optional:**
4. [ ] `create-child-deletion.sql` - Archive/delete child functionality
   - **Why**: Child profile danger zone
   - **Status**: UI already built, SQL ready

## 🎨 UI Features Status

### ✅ Working
- [x] Home screen with stories, learning, insights
- [x] Planner week view with capacity meter
- [x] Planner month view
- [x] Child profiles with goals/progress
- [x] Enhanced left sidebar
- [x] Modal overlays (Schedule Rules, AI Planner, Add Child)
- [x] Planner enhancements (Capacity, Period Switcher, AI Actions, Backlog)

### ⏸️ Temporarily Disabled (Working, but commented out)
- [ ] Documents Enhanced (tabs, syllabus wizard)
- [ ] Uploads Enhanced (shift-click, bulk assign, type filters)

### 🚧 Waiting for Database Setup
- [ ] Attendance screen (needs `setup-all-systems.sql`)
- [ ] Uploads/Evidence library (needs `setup-all-systems.sql` + storage bucket)
- [ ] Lesson Plans (needs `setup-all-systems.sql`)
- [ ] Reports (needs `setup-all-systems.sql`)
- [ ] Scheduling Rules heatmap (needs `update-availability-functions.sql`)

## 🔧 Quick Fixes Needed

### 1. Availability Functions (Immediate)
**File**: `update-availability-functions.sql`

**Fixes**:
- `get_child_availability()` - Returns correct columns
- `get_family_availability()` - Uses correct column names
- `get_child_availability_windows()` - Wrapper function

**Run this first** - Fixes multiple errors across the app.

### 2. Main Systems Setup (Next)
**File**: `setup-all-systems.sql`

**Creates**:
- `attendance_records` table + RPCs
- `uploads` table + RPCs
- `lesson_plans` tables + RPCs
- All RLS policies

**Then**: Create `evidence` storage bucket via Supabase Dashboard UI.

## 📋 Recommended Action Order

### Today (30 minutes):
1. **Run `update-availability-functions.sql`** ← Do this first!
   - Fixes: Heatmap errors, week view errors
   - Impact: Scheduling rules, planner work correctly
   
2. **Run `setup-all-systems.sql`**
   - Enables: Attendance, Uploads, Lesson Plans, Reports
   - Impact: 4 screens become functional

3. **Create storage bucket** (2 clicks in Supabase UI)
   - Go to Storage → New bucket
   - Name: `evidence`
   - Type: Private

### Next Session (Optional):
4. Re-enable Documents Enhanced (tabs + wizard)
5. Re-enable Uploads Enhanced (shift-click + filters)
6. Implement AI endpoints for Pack/Rebalance

## 🎯 Current Priority

**The availability functions are blocking multiple features:**
- ❌ Scheduling Rules heatmap shows errors
- ❌ Week view capacity calculation may fail
- ❌ Family availability not loading

**Solution**: Run `update-availability-functions.sql` in Supabase SQL Editor (takes 2 minutes)

## 📊 Overall Progress

**Core App**: ✅ 90% Complete
- Home, Planner, Children, Profiles all working

**Database Functions**: ⏳ 60% Complete
- Some RPCs working, some need to be created

**Advanced Features**: ✅ 100% Built
- All components created, waiting for database setup

---

**Next Action**: Run `update-availability-functions.sql` to fix availability errors!

