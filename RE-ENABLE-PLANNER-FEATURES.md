# Re-Enable Planner Features

## Current Status
✅ **App should be running** - Planner features temporarily disabled to fix white screen

## What's Temporarily Disabled

### In `components/planner/PlannerWeek.js`:
- Capacity Meter
- Period Switcher
- AI Actions dropdown
- Backlog button and drawer
- Reschedule Report modal

### In `components/WebContent.js`:
- Kanban Board component

## How to Re-Enable (Gradually)

### Step 1: Test Basic App
```bash
# Restart dev server with cleared cache:
npm start -- --reset-cache
```

**Check**: App loads without white screen ✅

### Step 2: Re-Enable One Component at a Time

**File**: `components/planner/PlannerWeek.js`

**2a. Uncomment imports:**
```javascript
// Change from:
// import CapacityMeter from './CapacityMeter';

// To:
import CapacityMeter from './CapacityMeter';
```

**2b. Uncomment one usage:**
```javascript
// Enable Capacity Meter first (simplest):
{selectedChildIds && selectedChildIds.length > 0 && (
  <View style={{ paddingHorizontal: 16 }}>
    <CapacityMeter
      childId={selectedChildIds[0]}
      subjectId={null}
      weekStart={weekStart.toISOString().slice(0, 10)}
      weekEnd={addDays(weekStart, 6).toISOString().slice(0, 10)}
      onRefresh={capacityRefresh}
    />
  </View>
)}
```

**2c. Refresh and test**
- Go to Planner → Week
- Check for white screen
- If OK, proceed to next component

### Step 3: Enable Features in Order

**Order** (simplest to most complex):

1. **Capacity Meter** - No external dependencies
2. **Period Switcher** - Uses vanilla JS dates
3. **Backlog Button** (not drawer yet)
4. **AI Actions Menu** (dropdown only)
5. **Backlog Drawer** (full modal)
6. **Reschedule Report Modal**
7. **Kanban Board**

### Step 4: Check Browser Console

If white screen occurs:
1. Open browser console (F12)
2. Look for error messages
3. Note which component caused it
4. Check for:
   - Missing imports
   - Undefined props
   - API errors

## Common Issues & Fixes

### Issue: "Cannot find module"
**Cause**: Import path incorrect
**Fix**: Check file exists in correct location

### Issue: "X is not a function"
**Cause**: Component receiving wrong props
**Fix**: Check prop types match

### Issue: "Cannot read property of undefined"
**Cause**: Data not loaded yet
**Fix**: Add null checks and loading states

### Issue: Database errors (404/500)
**Cause**: RPC not created or table doesn't exist
**Fix**: Ensure `create-planner-capacity-rpc.sql` was run

## Full Re-Enable Instructions

### When Everything is Working:

**In `components/planner/PlannerWeek.js`**:

```javascript
// Line 8-12: Uncomment all imports
import BacklogDrawer from './BacklogDrawer';
import CapacityMeter from './CapacityMeter';
import PeriodSwitcher from './PeriodSwitcher';
import AIActions from './AIActions';
import RescheduleReportModal from './RescheduleReportModal';

// Line 247-250: Uncomment Period Switcher
<PeriodSwitcher
  currentPeriod={currentPeriod}
  onPeriodChange={handlePeriodChange}
/>

// Line 277-281: Uncomment AI Actions
<AIActions
  onPackThisWeek={handlePackThisWeek}
  onRebalance4Weeks={handleRebalance4Weeks}
  onWhatIf={handleWhatIf}
/>

// Line 284-291: Uncomment Backlog Button
<TouchableOpacity
  style={styles.backlogButton}
  onPress={() => setShowBacklog(true)}
>
  <List size={16} color={colors.text} />
  <Text style={styles.backlogButtonText}>Backlog</Text>
</TouchableOpacity>

// Line 305-315: Uncomment Capacity Meter
{selectedChildIds && selectedChildIds.length > 0 && (
  <View style={{ paddingHorizontal: 16 }}>
    <CapacityMeter ... />
  </View>
)}

// Line 370-392: Uncomment Backlog Drawer and Report Modal
<BacklogDrawer ... />
{rescheduleReport && <RescheduleReportModal ... />}
```

**In `components/WebContent.js`**:

```javascript
// Line 76: Uncomment import
import KanbanBoard from './planner/KanbanBoard';

// Line 3007-3012: Uncomment Kanban usage
<KanbanBoard
  childId={selectedCalendarChildren?.[0]}
  subjectId={null}
  weekStart={null}
  weekEnd={null}
/>
```

## Quick Rollback

If issues persist, keep features disabled and use the current working version.

The components are all valid and ready - just need careful re-enabling to identify any runtime issues.

## Database Requirements

Ensure these tables exist:
- ✅ `learning_backlog` - For backlog items
- ✅ `events` - For scheduled events
- ✅ `calendar_days_cache` - For capacity
- ✅ RPC `compute_week_capacity` - Run the SQL

If `learning_backlog` doesn't exist, create it or the BacklogDrawer will error.

## Expected Result

When fully re-enabled:
- ✅ Capacity meter shows progress bar
- ✅ Period chips navigate weeks
- ✅ AI dropdown works
- ✅ Backlog button opens drawer
- ✅ Kanban board renders

---

**Current State**: App running, features ready to re-enable gradually.

**Recommendation**: Re-enable one component at a time, testing after each.

