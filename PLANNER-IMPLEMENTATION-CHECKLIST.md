# Planner Enhancements - Implementation Checklist

## ✅ What's Been Created

### SQL
- [x] `create-planner-capacity-rpc.sql` - Capacity computation function

### React Native Components
- [x] `BacklogDrawer.js` - Right-side task backlog drawer
- [x] `CapacityMeter.js` - Week capacity progress bar
- [x] `PeriodSwitcher.js` - This Week / Next Week / This Unit
- [x] `AIActions.js` - AI menu (Pack / Rebalance / What-if)
- [x] `RescheduleReportModal.js` - AI proposal review modal
- [x] `KanbanBoard.js` - Status-based board view

### Documentation
- [x] `PLANNER-ENHANCEMENTS-GUIDE.md` - Complete guide

## 🔧 Integration Steps

### Step 1: Database Setup (5 minutes)
```bash
# Run in Supabase SQL Editor:
# File: create-planner-capacity-rpc.sql
```

**What it does**:
- Creates `compute_week_capacity()` RPC
- No table changes
- Uses existing `calendar_days_cache` and `events`

### Step 2: Import Components into PlannerWeek

**File**: `components/planner/PlannerWeek.js`

**Add imports**:
```javascript
import BacklogDrawer from './BacklogDrawer';
import CapacityMeter from './CapacityMeter';
import PeriodSwitcher from './PeriodSwitcher';
import AIActions from './AIActions';
import RescheduleReportModal from './RescheduleReportModal';
```

**Add state**:
```javascript
const [showBacklog, setShowBacklog] = useState(false);
const [currentPeriod, setCurrentPeriod] = useState('this-week');
const [rescheduleReport, setRescheduleReport] = useState(null);
```

**Add to header**:
```javascript
<View style={{ flexDirection: 'row', gap: 12 }}>
  <PeriodSwitcher
    currentPeriod={currentPeriod}
    onPeriodChange={(period, dates) => {
      setCurrentPeriod(period);
      setWeekStart(dates.start.toISODate());
      setWeekEnd(dates.end.toISODate());
    }}
  />
  
  <AIActions
    onPackThisWeek={() => alert('Pack This Week - Coming soon!')}
    onRebalance4Weeks={() => alert('Rebalance - Coming soon!')}
    onWhatIf={() => alert('What-if - Coming soon!')}
  />
  
  <TouchableOpacity onPress={() => setShowBacklog(true)}>
    <Text>Backlog</Text>
  </TouchableOpacity>
</View>
```

**Add capacity meter** (above grid):
```javascript
<CapacityMeter
  childId={selectedChildIds?.[0]}
  subjectId={null}
  weekStart={weekStart}
  weekEnd={weekEnd}
/>
```

**Add backlog drawer** (at end):
```javascript
<BacklogDrawer
  open={showBacklog}
  onClose={() => setShowBacklog(false)}
  childId={selectedChildIds?.[0]}
  onDragStart={(item) => console.log('Dragging:', item)}
/>
```

**Add reschedule modal** (at end):
```javascript
{rescheduleReport && (
  <RescheduleReportModal
    open={!!rescheduleReport}
    onClose={() => setRescheduleReport(null)}
    proposals={rescheduleReport.proposals}
    explanation={rescheduleReport.explanation}
    onApply={async () => {
      // TODO: Implement proposal application
      setRescheduleReport(null);
    }}
  />
)}
```

### Step 3: Add Kanban View Route

**In WebContent.js**, add new tab:

```javascript
case 'kanban':
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSubtle }}>
      <PageHeader
        title="Kanban Board"
        subtitle="Manage tasks by status"
      />
      <KanbanBoard
        childId={selectedChildIds?.[0]}
        subjectId={null}
      />
    </View>
  );
```

**In EnhancedLeftSidebar.js**, add link (or use view toggle).

### Step 4: Test Features

**Capacity Meter**:
- [ ] Shows on planner week view
- [ ] Updates when week changes
- [ ] Correct numbers (planned/capacity)
- [ ] Color changes based on percentage
- [ ] Details expand/collapse

**Backlog Drawer**:
- [ ] Opens from "Backlog" button
- [ ] Lists learning_backlog items
- [ ] Filters work (Overdue, Tests, High Priority)
- [ ] Search works
- [ ] Cards show all metadata
- [ ] Closes properly

**Period Switcher**:
- [ ] This Week sets current week
- [ ] Next Week sets next week
- [ ] Active period highlighted

**AI Actions**:
- [ ] Dropdown opens/closes
- [ ] 3 menu items appear
- [ ] Click triggers callback

**Kanban Board**:
- [ ] Shows 4 columns
- [ ] Cards populate from DB
- [ ] Empty columns show placeholder

## 🚀 Quick Start

**Minimum viable integration** (10 minutes):

1. Run SQL in Supabase
2. Add CapacityMeter to PlannerWeek header
3. Add "Backlog" button that opens BacklogDrawer
4. Test capacity calculation
5. Test backlog loading

**Full integration** (30 minutes):

1. All of above
2. Add PeriodSwitcher
3. Add AIActions menu
4. Hook up all callbacks
5. Test end-to-end

## 📊 Success Metrics

After implementation, you should have:
- ✅ Capacity meter showing utilization
- ✅ Backlog drawer accessible from planner
- ✅ Period switching working
- ✅ AI menu available (even if placeholders)
- ✅ Foundation for drag-drop scheduling
- ✅ Kanban view for status management

## 🎯 Priority Order

If implementing incrementally:

**Phase 1** (Core):
1. SQL RPC ✅
2. CapacityMeter ✅
3. BacklogDrawer (read-only) ✅

**Phase 2** (Navigation):
4. PeriodSwitcher ✅
5. Kanban view ✅

**Phase 3** (AI):
6. AIActions menu ✅
7. RescheduleReportModal ✅
8. AI API endpoints (to implement)

**Phase 4** (Polish):
9. Drag-drop from backlog to grid
10. Inline event rescheduling
11. Collision detection
12. Tooltips for blocked slots

---

**Current Status**: ✅ All components built, ready for integration!

**Next Action**: Run the SQL and import components into PlannerWeek.

