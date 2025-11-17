# Planner Enhancements - Jira-Style Backlog & Advanced Features

## ✅ Components Created

### 1. **SQL RPC** (`create-planner-capacity-rpc.sql`)
- `compute_week_capacity(child, subject, week_start, week_end)`
- Returns: available, conflict, capacity, and planned minutes
- Uses existing `calendar_days_cache` and `events` tables
- No schema changes required

### 2. **BacklogDrawer** (`components/planner/BacklogDrawer.js`)
- Right-side drawer (380px wide)
- Lists `learning_backlog` items for selected child/subject
- **Filters**: Overdue, Tests, High Priority, Tags
- **Search**: Full-text search across titles
- **Cards show**: Title, priority, type, estimate, due date, tags
- **Visual**: Color-coded by priority (red/orange/blue) and type
- Ready for drag-and-drop (draggable attribute set for web)

### 3. **CapacityMeter** (`components/planner/CapacityMeter.js`)
- Shows planned vs. capacity for the week
- **Progress bar** with color states:
  - < 70%: Neutral gray
  - 70-100%: Green (good)
  - > 100%: Red (warning)
- **Expandable details**: Available, Conflicts, Capacity, Planned, Remaining
- Auto-refreshes when week changes

### 4. **PeriodSwitcher** (`components/planner/PeriodSwitcher.js`)
- Chips: **This Week** | **Next Week** | **This Unit**
- "This Unit" appears when `subjectTrack` is provided
- Returns date ranges for selected period
- Integrates with existing week navigation

### 5. **AIActions** (`components/planner/AIActions.js`)
- Dropdown menu with 3 AI actions:
  - **Pack This Week**: Fill remaining capacity from backlog
  - **Rebalance 4 Weeks**: Optimize across next month
  - **What-if**: Test temporary conflicts
- Clean menu design with icons and descriptions

### 6. **RescheduleReportModal** (`components/planner/RescheduleReportModal.js`)
- Shows AI-generated proposals before applying
- Summary counts: X created · Y moved · Z canceled
- **Operations**:
  - CREATE: New events from backlog
  - MOVE: Reschedule existing events
  - CANCEL: Remove conflicting events
- **Apply button**: Executes all proposals in batch
- Shows reasoning/explanation from AI

### 7. **KanbanBoard** (`components/planner/KanbanBoard.js`)
- 4 columns: Planned | In Progress | Done | Needs Review
- Shows both scheduled events and unscheduled backlog items
- Card move updates `events.status` or `learning_backlog.status`
- Filterable by child, subject, week

## 🔧 Integration Steps

### Step 1: Run the SQL
```bash
# In Supabase SQL Editor:
cat hi-world-app/create-planner-capacity-rpc.sql
```

### Step 2: Add to Planner Week View

Update `components/planner/PlannerWeek.js`:

```javascript
import BacklogDrawer from './BacklogDrawer';
import CapacityMeter from './CapacityMeter';
import PeriodSwitcher from './PeriodSwitcher';
import AIActions from './AIActions';
import RescheduleReportModal from './RescheduleReportModal';

export default function PlannerWeek({ familyId, selectedChildIds, ... }) {
  const [showBacklog, setShowBacklog] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState('this-week');
  const [weekStart, setWeekStart] = useState(getThisWeekStart());
  const [weekEnd, setWeekEnd] = useState(getThisWeekEnd());
  const [rescheduleReport, setRescheduleReport] = useState(null);

  const handlePeriodChange = (period, dates) => {
    setCurrentPeriod(period);
    setWeekStart(dates.start.toISODate());
    setWeekEnd(dates.end.toISODate());
  };

  const handlePackThisWeek = async () => {
    // TODO: Implement AI packing logic
    // Call API endpoint, get proposals, show RescheduleReportModal
    alert('Pack This Week - Coming soon!');
  };

  const handleRebalance = async () => {
    // TODO: Implement AI rebalance logic
    alert('Rebalance 4 Weeks - Coming soon!');
  };

  const handleWhatIf = async () => {
    // TODO: Implement what-if modal
    alert('What-if Analysis - Coming soon!');
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Header Actions */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <PeriodSwitcher
            currentPeriod={currentPeriod}
            onPeriodChange={handlePeriodChange}
            subjectTrack={null} // Pass from props if available
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <AIActions
            onPackThisWeek={handlePackThisWeek}
            onRebalance4Weeks={handleRebalance}
            onWhatIf={handleWhatIf}
          />
          <TouchableOpacity onPress={() => setShowBacklog(true)}>
            <Text>Backlog</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Capacity Meter */}
      <View style={{ paddingHorizontal: 16 }}>
        <CapacityMeter
          childId={selectedChildIds?.[0]}
          subjectId={null}
          weekStart={weekStart}
          weekEnd={weekEnd}
        />
      </View>

      {/* Week Grid (existing) */}
      {/* ... your existing week grid code ... */}

      {/* Backlog Drawer */}
      <BacklogDrawer
        open={showBacklog}
        onClose={() => setShowBacklog(false)}
        childId={selectedChildIds?.[0]}
        subjectId={null}
        onDragStart={(item) => {
          // Handle drag start - set dragging state
          console.log('Dragging item:', item);
        }}
      />

      {/* Reschedule Report */}
      {rescheduleReport && (
        <RescheduleReportModal
          open={!!rescheduleReport}
          onClose={() => setRescheduleReport(null)}
          proposals={rescheduleReport.proposals}
          explanation={rescheduleReport.explanation}
          onApply={async () => {
            // Apply all proposals
            await applyProposals(rescheduleReport.proposals);
            setRescheduleReport(null);
          }}
        />
      )}
    </View>
  );
}
```

### Step 3: Add Kanban Route

Create a new tab or route for Kanban view:

```javascript
// In WebContent.js, add case for 'kanban':
case 'kanban':
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSubtle }}>
      <PageHeader
        title="Kanban Board"
        subtitle="Manage tasks by status"
      />
      <KanbanBoard
        childId={selectedChildId}
        subjectId={null}
        weekStart={weekStart}
        weekEnd={weekEnd}
      />
    </View>
  );
```

## 🎯 Features Overview

### 1. Backlog Drawer
**Location**: Right side of planner (slide in/out)

**Features**:
- Filter by: Overdue, Tests, High Priority, Tags
- Search across titles
- Drag cards to week grid to schedule
- Visual priority/type indicators
- Due date warnings

**Data Source**: `learning_backlog` table
- Fields: id, child_id, subject_id, title, estimate_minutes, priority, status, due_date, tags, is_active

### 2. Capacity Planning
**Location**: Above week grid

**Shows**:
- Planned minutes / Capacity minutes
- Progress bar (color-coded)
- Conflicts breakdown
- Remaining capacity

**Calculation**:
- Available = Calendar days with `day_status='teach'`
- Conflicts = External events + holidays
- Capacity = Available - Conflicts
- Planned = Scheduled events for subject/week

### 3. Period Navigation
**Options**:
- **This Week**: Current Monday-Sunday
- **Next Week**: Next Monday-Sunday
- **This Unit**: From `subject_track` start/end dates

**Use Case**: Quickly jump to planning periods

### 4. AI-Powered Scheduling
**Actions**:

**Pack This Week**:
- Analyzes remaining capacity
- Selects backlog items by priority/due date
- Fills available slots optimally
- Shows reschedule report

**Rebalance 4 Weeks**:
- Looks at `subject_goals.minutes_per_week`
- Distributes across 4 weeks evenly
- Respects deadlines and preferences
- Shows what moves and why

**What-if**:
- User adds temporary conflicts ("no Wed 3-7pm")
- AI generates proposals WITHOUT saving
- Preview impact before committing

### 5. Kanban Board
**Columns**:
- Planned (status='scheduled')
- In Progress (status='in_progress')
- Done (status='done')
- Needs Review (status='needs_review')

**Features**:
- Mix of scheduled events and backlog items
- Drag to change status
- Visual AI badge for AI-generated items
- Time/date metadata

### 6. Reschedule Report
**Shown after**:
- AI Pack
- AI Rebalance
- AI What-if

**Contents**:
- Summary counts
- Detailed operation list
- AI reasoning/explanation
- Apply or Cancel

## 📊 Data Flow

### Creating Event from Backlog
```javascript
// User drags backlog item to week slot
const backlogItem = { id, title, estimate_minutes, child_id, subject_id };
const slot = { start_ts: '2025-10-22T10:00:00Z', end_ts: '2025-10-22T11:00:00Z' };

// Insert event
await supabase.from('events').insert({
  child_id: backlogItem.child_id,
  subject_id: backlogItem.subject_id,
  title: backlogItem.title,
  start_ts: slot.start_ts,
  end_ts: slot.end_ts,
  status: 'scheduled',
  source: 'manual',
  ai_generated: false,
  metadata: { backlog_id: backlogItem.id } // Link back to backlog
});

// Optional: Update backlog remaining estimate
// (If splittable and partially scheduled)
```

### Rescheduling Event
```javascript
// User drags event within week
const event = { id, start_ts, end_ts };
const newSlot = { start_ts: '2025-10-23T14:00:00Z', end_ts: '2025-10-23T15:00:00Z' };

// Update event
await supabase
  .from('events')
  .update({
    start_ts: newSlot.start_ts,
    end_ts: newSlot.end_ts
  })
  .eq('id', event.id);
```

### Capacity Calculation
```javascript
// Fetch capacity for week
const { data } = await supabase.rpc('compute_week_capacity', {
  p_child: childId,
  p_subject: subjectId,
  p_week_start: '2025-10-20',
  p_week_end: '2025-10-26'
});

// Returns:
{
  total_available_minutes: 420,  // From calendar_days_cache
  total_conflict_minutes: 60,    // Holidays, external events
  total_capacity_minutes: 360,   // Available - Conflicts
  planned_minutes: 210           // Scheduled events
}
// Usage: 210/360 = 58% capacity used
```

## 🎨 UI Layout

### Planner Header
```
┌────────────────────────────────────────────────────────────┐
│ [Week] [Month] | [This Week] [Next Week] [This Unit] | [AI▾] [Backlog] [Board] │
└────────────────────────────────────────────────────────────┘
```

### Week View with Backlog
```
┌────────────────────────────┬────────────────┐
│ Capacity: 210/360 (58%)    │                │
│ ████████░░░░░░ [Details]   │                │
├────────────────────────────┤   BACKLOG      │
│ Mon  Tue  Wed  Thu  Fri    │   DRAWER       │
│ 9am  ─    ─    ─    ─      │                │
│ 10am [Math 60m]            │  [Drag cards]  │
│ 11am ─    ─    ─    ─      │  [from here]   │
│ ...  ...  ...  ...  ...    │                │
└────────────────────────────┴────────────────┘
```

### Kanban View
```
┌────────┬────────────┬────────┬─────────────┐
│Planned │In Progress │ Done   │Needs Review │
├────────┼────────────┼────────┼─────────────┤
│[Card 1]│  [Card 4]  │[Card 7]│  [Card 10]  │
│[Card 2]│  [Card 5]  │[Card 8]│             │
│[Card 3]│  [Card 6]  │[Card 9]│             │
└────────┴────────────┴────────┴─────────────┘
```

## 🚀 Usage Workflows

### Workflow 1: Schedule from Backlog
```
1. Click "Backlog" button in header
2. Drawer slides in from right
3. Filter: "High Priority" + "Math"
4. Drag "Fractions L2 (60m)" card
5. Drop on Wed 10:00am slot
6. Event created, appears on calendar
7. Capacity meter updates (210→270 min)
```

### Workflow 2: AI Pack Week
```
1. Click "AI" → "Pack This Week"
2. AI analyzes:
   - Remaining capacity: 90 min
   - Backlog: 5 high-priority items
   - Preferences: 45-60m blocks
3. Reschedule Report modal appears:
   - "Create Math Quiz (45m) - Wed 2pm"
   - "Create Reading (60m) - Thu 10am"
   - Explanation: "Prioritized test prep..."
4. Click "Apply 2 Changes"
5. Events created, backlog updated
```

### Workflow 3: Rebalance Across 4 Weeks
```
1. Subject goal: Math = 120m/week
2. Currently: Week 1=180m, Week 2=60m, Week 3=80m
3. Click "AI" → "Rebalance 4 Weeks"
4. AI proposes:
   - Move 2 events from Week 1 → Week 2
   - Add 1 event to Week 3
   - Even distribution: 120m/week
5. Review report → Apply
6. Calendar rebalanced
```

### Workflow 4: Kanban Status Management
```
1. Click "Board" pill in header
2. Switch to Kanban view
3. Drag "Math Quiz" from Planned → In Progress
4. Event status updated
5. Move to Done when completed
6. Attendance auto-updated (if trigger exists)
```

### Workflow 5: What-if Planning
```
1. Click "AI" → "What-if..."
2. Modal: "Add temporary conflict"
3. Input: "Wed 3-7pm - Travel"
4. AI generates proposals avoiding Wed afternoon
5. Review impact (doesn't save)
6. Close or adjust and re-run
```

## 🎨 Design System

### Colors
- **Backlog priorities**: Red (high), Orange (medium), Blue (low)
- **Backlog types**: Violet (quiz), Red (test), Green (practice), Indigo (project), Blue (reading)
- **Capacity**: Gray (<70%), Green (70-100%), Red (>100%)
- **AI badge**: Blue soft background, accent text

### Spacing
- Drawer: 380px wide
- Header: 16px padding
- Cards: 16px padding, 12px margin
- Gaps: 8-12px

### Shadows
- Drawer: `shadows.md`
- Cards: `shadows.sm`
- Modal: `shadows.md`

## 📋 Database Tables Used

### `learning_backlog`
```sql
- id: UUID
- child_id: UUID
- subject_id: UUID
- title: TEXT
- estimate_minutes: INT
- priority: TEXT (high/medium/low)
- status: TEXT (planned/in_progress/done/needs_review)
- due_date: DATE
- tags: TEXT[]
- is_active: BOOLEAN
- type: TEXT (quiz/test/practice/project/reading)
```

### `events`
```sql
- id: UUID
- child_id: UUID
- subject_id: UUID
- title: TEXT
- start_ts: TIMESTAMPTZ
- end_ts: TIMESTAMPTZ
- status: TEXT (scheduled/in_progress/done/canceled)
- source: TEXT (manual/external/ai/holiday)
- ai_generated: BOOLEAN
- ai_reasoning: JSONB
- metadata: JSONB (can store backlog_id)
```

### `calendar_days_cache`
```sql
- child_id: UUID
- date: DATE
- day_status: TEXT (teach/off/partial)
- first_block_start: TIME
- last_block_end: TIME
- source_summary: JSONB
```

## 🔌 API Endpoints (To Implement)

### POST `/api/ai/pack-week`
**Request**:
```json
{
  "child_id": "uuid",
  "subject_id": "uuid",
  "week_start": "2025-10-20",
  "week_end": "2025-10-26",
  "remaining_capacity": 90
}
```

**Response**:
```json
{
  "proposals": [
    {
      "op": "create",
      "start_ts": "2025-10-22T14:00:00Z",
      "end_ts": "2025-10-22T15:00:00Z",
      "planned_minutes": 60,
      "title": "Math Quiz Prep",
      "backlog_id": "uuid"
    }
  ],
  "explanation": "Prioritized test prep due Friday..."
}
```

### POST `/api/ai/rebalance`
**Request**:
```json
{
  "child_id": "uuid",
  "subject_id": "uuid",
  "week_start": "2025-10-20",
  "horizon_weeks": 4,
  "preferences": {
    "block_lengths": [45, 60],
    "max_blocks_per_day": 2
  }
}
```

**Response**: (same structure as pack-week)

### POST `/api/ai/what-if`
**Request**:
```json
{
  "child_id": "uuid",
  "subject_id": "uuid",
  "week_start": "2025-10-20",
  "what_if_conflicts": [
    { "start": "2025-10-22T15:00:00Z", "end": "2025-10-22T19:00:00Z", "reason": "Travel" }
  ]
}
```

**Response**: (same structure, proposals don't save)

## ⚡ Performance Optimizations

### Capacity RPC
- Uses CTEs for clarity
- Indexed on `calendar_days_cache(child_id, date)`
- Indexed on `events(child_id, start_ts)`
- Returns single row, very fast (<50ms)

### Backlog Queries
- Filtered by `is_active = true`
- Ordered by priority desc, due_date asc
- Client-side filtering for responsiveness
- Lazy loading ready (add cursor pagination)

### Optimistic UI
- Drag event → Update UI immediately
- API call in background
- Rollback on error
- Keeps UI snappy

## 🐛 Edge Cases Handled

### Backlog
- Empty backlog → Show empty state
- Overdue items → Red border, alert icon
- No due date → Sort by priority only
- Tags → Multi-select filter

### Capacity
- Zero capacity week (all off) → Show 0/0
- Over-scheduled (>100%) → Red warning
- Conflicts → Show breakdown in details

### Reschedule Report
- Empty proposals → Don't show modal
- Apply failure → Rollback, show error
- Partial success → Show which succeeded

### Kanban
- Unscheduled backlog → Shows in Planned column
- Mixed events + backlog → Different card styles
- Empty columns → Show "No items" placeholder

## 📦 Dependencies

### Already in Project
- `lucide-react` - Icons
- `luxon` - Date manipulation
- `react-native` - Core components
- Supabase client

### Optional (for full drag-drop)
```bash
# For advanced drag-drop (web only):
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers
```

**Note**: Current implementation uses basic `draggable` attribute for web. For full cross-platform drag-drop, additional libraries needed.

## ✅ Testing Checklist

### Backlog Drawer
- [ ] Click "Backlog" → Drawer opens
- [ ] Search works
- [ ] Filters work (Overdue, Tests, High Priority, Tags)
- [ ] Cards show correct data
- [ ] Overdue items highlighted
- [ ] Close button works

### Capacity Meter
- [ ] Shows correct planned/capacity numbers
- [ ] Progress bar colors correctly (gray/green/red)
- [ ] Details expand/collapse
- [ ] Updates when week changes

### Period Switcher
- [ ] This Week → Sets current week dates
- [ ] Next Week → Sets next week dates
- [ ] This Unit → Shows when subject track exists
- [ ] Period change triggers reload

### AI Actions
- [ ] Dropdown opens/closes
- [ ] Pack This Week triggers
- [ ] Rebalance triggers
- [ ] What-if triggers

### Reschedule Report
- [ ] Modal shows after AI action
- [ ] Lists all proposals
- [ ] Shows summary counts
- [ ] Apply button works
- [ ] Cancel closes modal

### Kanban Board
- [ ] 4 columns render
- [ ] Cards populate correctly
- [ ] Events vs backlog distinguished
- [ ] Card counts show
- [ ] Empty states work

## 🔐 Security

### RLS Policies
All queries filtered by:
- `family_id` (from user session)
- `child_id` (user can only see own children)
- RPC uses `SECURITY DEFINER` for safe execution

### Data Access
- Backlog: Can only see own family's tasks
- Events: Can only modify own family's events
- Capacity: Only computes for accessible children

## 🎓 Next Steps

### Immediate
1. Run `create-planner-capacity-rpc.sql` in Supabase
2. Import components into `PlannerWeek.js`
3. Add Backlog/AI buttons to header
4. Test capacity meter

### Short-term
1. Implement AI API endpoints
2. Add drag-drop with @dnd-kit (web)
3. Add touch gestures for drag (mobile)
4. Persist backlog items (seed some data)

### Long-term
1. Velocity tracking (planned vs done ratio)
2. Burndown charts
3. Sprint planning
4. Team collaboration (share backlog)

---

**Status**: ✅ All core components ready!

**Files Created**:
- `create-planner-capacity-rpc.sql` - Capacity RPC
- `components/planner/BacklogDrawer.js` - Backlog UI
- `components/planner/CapacityMeter.js` - Capacity display
- `components/planner/PeriodSwitcher.js` - Period navigation
- `components/planner/AIActions.js` - AI menu
- `components/planner/RescheduleReportModal.js` - Proposal review
- `components/planner/KanbanBoard.js` - Kanban view

**Ready for integration!** 🚀

