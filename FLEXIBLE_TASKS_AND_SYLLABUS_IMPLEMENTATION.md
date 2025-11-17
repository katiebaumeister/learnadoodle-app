# Flexible Tasks & Syllabus System - Implementation Summary

## ✅ What's Been Implemented

### Database Schema (SQL Migrations)

1. **`flexible_tasks_and_syllabus_system.sql`**
   - Added flexible task columns to `events` table
   - Created `backlog_items` table
   - Added document stats columns to `uploads` table
   - Created `syllabi`, `syllabus_sections`, `plan_suggestions` tables
   - Created `school_years`, `year_subjects` tables
   - All RLS policies configured

2. **`flexible_tasks_and_syllabus_rpcs.sql`**
   - `get_flexible_backlog()` - Get unscheduled tasks
   - `compute_free_gaps()` - Find available time slots
   - `find_slot_for_flexible()` - Auto-schedule flexible tasks
   - `get_light_evidence_subjects()` - Find subjects with low uploads
   - `done_vs_scheduled()` - Compare progress
   - `compare_to_syllabus_week()` - Syllabus pacing check
   - `bootstrap_next_year()` - Create next school year

### Backend API Routes (Express.js)

1. **`lib/flexibleTasksRoutes.js`**
   - `POST /api/flexible/create` - Create backlog item or flexible event
   - `GET /api/flexible/backlog` - Get flexible backlog
   - `POST /api/flexible/schedule` - Auto-schedule a task
   - `POST /api/flexible/convert` - Convert backlog to event

2. **`lib/syllabusRoutes.js`**
   - `POST /api/syllabus/upload` - Mark upload as syllabus
   - `GET /api/syllabus/:id` - Get syllabus with sections
   - `POST /api/syllabus/:id/suggest` - Generate suggestions
   - `POST /api/syllabus/:id/accept` - Accept suggestions → create events
   - `POST /api/syllabus/:id/dismiss` - Dismiss suggestions
   - `PATCH /api/events/:id/link-syllabus` - Link event to syllabus
   - `GET /api/syllabus/compare-week` - Compare progress vs syllabus

3. **`lib/documentStatsRoutes.js`**
   - `GET /api/documents/light-subjects` - Get subjects with low uploads
   - `GET /api/documents/stats` - Get document statistics

4. **`lib/yearPlannerRoutes.js`**
   - `POST /api/years/bootstrap` - Bootstrap next year
   - `GET /api/years` - List school years
   - `GET /api/years/:id/subjects` - Get year subjects

### Frontend Components

1. **`components/home/UnscheduledTasksCard.js`** ✅
   - Shows flexible tasks from backlog
   - Drag-to-calendar support
   - Auto-place button

2. **`components/home/DailyInsights.js`** ✅ (Updated)
   - Shows light subjects chips
   - Shows behind vs syllabus chips
   - Action handlers for uploads and flexible tasks

## 🔧 What Needs Integration

### 1. Run SQL Migrations

```bash
# In Supabase SQL Editor, run in order:
1. flexible_tasks_and_syllabus_system.sql
2. flexible_tasks_and_syllabus_rpcs.sql
```

### 2. Update Home Screen (`WebContent.js`)

Add `UnscheduledTasksCard` to the right column:

```javascript
import UnscheduledTasksCard from './home/UnscheduledTasksCard';

// In renderHomeContent(), add to homeSideColumn:
<UnscheduledTasksCard
  familyId={profile.family_id}
  onDragStart={(item) => {
    // Handle drag start (open planner in week view)
    onTabChange('planner');
    // Set dragged item in state
  }}
  onAutoPlace={async (item) => {
    // Call /api/flexible/schedule
    const res = await fetch('/api/flexible/schedule', {
      method: 'POST',
      body: JSON.stringify({
        source: item.source,
        id: item.id,
        family_id: profile.family_id,
        child_id: item.child_id,
        target_date: item.due_ts ? new Date(item.due_ts).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        estimated_minutes: item.estimated_minutes || 30
      })
    });
    // Refresh home data
  }}
/>
```

Update `DailyInsights` props:

```javascript
<DailyInsights
  familyId={profile.family_id}
  selectedChildId={selectedChildId || homeData.children[0]?.id}
  onUploadEvidence={(subjectId) => {
    // Navigate to documents upload
    onTabChange('documents');
  }}
  onAddFlexibleTask={(subjectId, minutes) => {
    // Create flexible task
    // Navigate to add activity or planner
    onTabChange('add-activity');
  }}
  // ... other props
/>
```

### 3. Update Backlog Drawer (`components/planner/BacklogDrawer.js`)

Add tabs for "Flexible" and "Syllabus Suggestions":

```javascript
const [activeTab, setActiveTab] = useState('flexible');
const [suggestions, setSuggestions] = useState([]);

// Load suggestions from plan_suggestions table
useEffect(() => {
  if (activeTab === 'suggestions') {
    loadSuggestions();
  }
}, [activeTab]);

// In render:
<Tabs>
  <Tab onPress={() => setActiveTab('flexible')}>Flexible</Tab>
  <Tab onPress={() => setActiveTab('suggestions')}>Syllabus Suggestions</Tab>
</Tabs>

{activeTab === 'flexible' && (
  // Existing backlog items
)}

{activeTab === 'suggestions' && (
  // Render suggestions from plan_suggestions
  // Drag to week grid → accept suggestion → create event
)}
```

### 4. Create Syllabus Viewer Component

Create `components/documents/SyllabusViewer.js`:

```javascript
// Shows syllabus outline (left) and detail pane (right)
// "Suggest Plan" button generates suggestions
// Review table with editable fields
// "Accept Plan" button creates events
```

### 5. Create Year Planner Wizard

Create `components/planner/YearPlannerWizard.js`:

```javascript
// Multi-step wizard:
// Step 1: Dates (next_start, next_end)
// Step 2: Subjects by child + weekly minutes
// Step 3: Confirm
// Calls /api/years/bootstrap
```

### 6. Update Event Modal

Add "Syllabus" tab to event detail modal:

```javascript
// Show linked section info
// "Open full syllabus" link
// Re-link dropdown
```

### 7. Syllabus Parsing Service

Update `lib/syllabusProcessor.js` to:
- Parse PDF/DOC files
- Extract units/lessons/assignments
- Detect dates and minutes
- Infer cadence if missing
- Use OpenAI/Claude for parsing

### 8. Children Detail Dashboard Updates

In `components/ChildProfile.js` or similar:
- Replace empty chart with "Done vs Scheduled vs Expected" per subject
- Add evidence summary rings (count/target)
- Upload CTA button

## 📝 Testing Checklist

- [ ] Run SQL migrations successfully
- [ ] Test `get_flexible_backlog` RPC
- [ ] Test `find_slot_for_flexible` RPC
- [ ] Test flexible task creation API
- [ ] Test syllabus upload → parse → suggest flow
- [ ] Test year bootstrap
- [ ] Test document stats queries
- [ ] Test syllabus comparison queries
- [ ] Verify RLS policies work correctly
- [ ] Test frontend components render correctly
- [ ] Test drag-drop from backlog to calendar
- [ ] Test auto-place functionality

## 🚀 Next Steps

1. **Run migrations** in Supabase SQL Editor
2. **Wire up frontend components** in WebContent.js
3. **Implement syllabus parsing** (integrate with OpenAI/Claude)
4. **Create remaining UI components** (SyllabusViewer, YearPlannerWizard)
5. **Test end-to-end flows**
6. **Add error handling** and loading states
7. **Polish UI/UX** (animations, transitions)

## 📚 Key Files Reference

- **Database**: `flexible_tasks_and_syllabus_system.sql`, `flexible_tasks_and_syllabus_rpcs.sql`
- **Backend**: `lib/flexibleTasksRoutes.js`, `lib/syllabusRoutes.js`, `lib/documentStatsRoutes.js`, `lib/yearPlannerRoutes.js`
- **Frontend**: `components/home/UnscheduledTasksCard.js`, `components/home/DailyInsights.js`
- **Integration**: `components/WebContent.js`, `components/planner/BacklogDrawer.js`

## 🔍 Notes

- Syllabus parsing is currently a placeholder - integrate with actual PDF/DOC parsing service
- All API routes use Express.js (not FastAPI) to match existing codebase
- RLS policies follow the same pattern as existing tables
- Frontend uses React Native components (works for web via react-native-web)

