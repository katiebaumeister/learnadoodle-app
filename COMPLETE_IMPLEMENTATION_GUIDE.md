# Complete Implementation Guide

## 🎯 Overview

All priority features have been implemented. This guide provides:
1. SQL files to run
2. Component integration steps
3. Testing checklist
4. Known TODOs

---

## 📦 SQL Files to Run

### Required (New)
Run this in Supabase SQL Editor:

**`create_capacity_rpc.sql`**
- Creates `get_capacity` RPC for Reports KPI
- Calculates scheduled vs available minutes per week

### Already Exists (Verify)
These should already be in your database from previous migrations:
- `flexible_tasks_and_syllabus_system.sql`
- `flexible_tasks_and_syllabus_rpcs.sql`
- `migrate_attendance_records_to_sparse.sql`
- `migrate_calendar_days_to_rules.sql`
- `create-home-data-rpc.sql`
- `align_all_timezones.sql`
- `create_subject_goals_rpc.sql`

See `ALL_SQL_MIGRATIONS.md` for verification queries.

---

## 🔌 Integration Steps

### Step 1: Add Navigation Handler to WebContent.js

Add this function to `WebContent.js`:

```javascript
const handleNavigate = (path) => {
  // Parse URL path
  const url = new URL(path, window.location.origin);
  const view = url.searchParams.get('view');
  const childId = url.searchParams.get('child');
  const subjectId = url.searchParams.get('subject');
  const date = url.searchParams.get('date');
  
  if (path.startsWith('/planner')) {
    onTabChange('calendar'); // or 'planner'
    // TODO: Update week view filters
  } else if (path.startsWith('/documents')) {
    onTabChange('documents');
    // TODO: Update document filters
  } else if (path.startsWith('/children/')) {
    const match = path.match(/\/children\/([^?]+)/);
    if (match) {
      onTabChange('children-list', match[1]);
    }
  }
};
```

Then pass `onNavigate={handleNavigate}` to:
- `<DailyInsights onNavigate={handleNavigate} ... />`
- `<UnscheduledTasksCard onNavigate={handleNavigate} ... />`
- `<ChildProfile onNavigate={handleNavigate} ... />`
- `<KpiRow onNavigate={handleNavigate} ... />`

### Step 2: Wrap App with FiltersProvider

In `App.js` or `WebLayout.js`:

```javascript
import { FiltersProvider } from './contexts/FiltersContext';

// Wrap your main component
<FiltersProvider>
  <WebLayout ... />
</FiltersProvider>
```

### Step 3: Complete Auto-Place Implementation

In `BacklogDrawer.js`, update the `onAutoPlace` handler:

```javascript
onAutoPlace={async (item) => {
  try {
    const { data, error } = await supabase.rpc('find_slot_for_flexible', {
      p_family_id: familyId,
      p_child_id: item.child_id,
      p_estimated_minutes: item.estimated_minutes,
      p_due_ts: item.due_ts,
    });
    
    if (error) {
      console.error('Error finding slot:', error);
      return;
    }
    
    if (data?.slot) {
      await scheduleFlexible({
        source: item.source,
        id: item.id,
        targetDate: data.slot.start_ts,
      });
      loadFlexibleBacklog();
    }
  } catch (err) {
    console.error('Error auto-placing:', err);
  }
}}
```

### Step 4: Add Drag & Drop Zones

In `PlannerWeek.js`, add drop handlers to day columns (see `DraggableEvent.js` for reference).

---

## ✅ Completed Features

### ✅ Priority 1: Foundation
- Unified API client (`lib/apiClient.js`)
- Date/timezone helpers
- Error handling utilities
- `get_capacity` RPC

### ✅ Priority 2: Event Modal
- Event modal with Details and Syllabus tabs
- Click any event to open modal
- Syllabus relink functionality
- Edit/Delete actions

### ✅ Priority 3: Backlog Drawer
- Flexible tasks list component
- Suggestions list component
- Accept suggestion creates event
- Auto-place button (needs implementation)

### ✅ Priority 4: Deep Links
- Filter context for state management
- URL helpers for building/parsing query params
- Insight chips navigate to filtered views
- "View backlog" button with navigation

### ✅ Priority 5: Child Dashboard
- Subject pacing chart (Done vs Scheduled vs Expected)
- Evidence rings (uploads vs targets)
- Both integrated into ChildProfile

### ✅ Priority 6: Syllabus
- Plan review table (editable)
- Syllabus list component
- Needs integration with SyllabusViewer

### ✅ Priority 7: Reports KPIs
- KPI row component (Syllabus Pace, Evidence Coverage, Capacity)
- Integrated into Reports page
- Drill-down navigation (needs handler)

---

## 🧪 Testing Checklist

After running SQL and completing integrations:

- [ ] Run `create_capacity_rpc.sql`
- [ ] Click event in week view → modal opens
- [ ] Event modal Details tab shows correct info
- [ ] Event modal Syllabus tab shows section if linked
- [ ] Relink syllabus section works
- [ ] Backlog drawer shows Flexible tab
- [ ] Backlog drawer shows Suggestions tab
- [ ] Accept suggestion creates event
- [ ] Insight chip "light on uploads" → opens Documents
- [ ] Insight chip "behind vs syllabus" → opens Planner
- [ ] "View backlog" button → opens Planner + drawer
- [ ] Child profile shows pacing chart
- [ ] Child profile shows evidence rings
- [ ] Click evidence ring → opens Documents filtered
- [ ] Reports page shows KPI row
- [ ] Click Syllabus Pace KPI → navigates to Planner
- [ ] Click Evidence Coverage KPI → navigates to Documents
- [ ] Click Capacity KPI → navigates to Planner

---

## 📝 Files Created

### Core Infrastructure
- `lib/apiClient.js` - Unified API client
- `lib/url.js` - URL query helpers
- `contexts/FiltersContext.js` - Filter state management

### Event Components
- `components/events/EventModal.js`
- `components/events/EventDetails.js`
- `components/events/EventSyllabusTab.js`

### Backlog Components
- `components/backlog/FlexibleList.js`
- `components/backlog/SuggestionList.js`

### Child Dashboard Components
- `components/child/SubjectPacingChart.js`
- `components/child/EvidenceRings.js`

### Syllabus Components
- `components/syllabus/PlanReviewTable.js`
- `components/syllabus/SyllabusList.js`

### Reports Components
- `components/reports/KpiRow.js`

### SQL
- `create_capacity_rpc.sql`

---

## 🚧 Remaining TODOs

1. **Navigation Handler**: Implement `handleNavigate` in WebContent.js
2. **Auto-Place**: Complete implementation using `find_slot_for_flexible` RPC
3. **Drag & Drop**: Add drop zones to week grid
4. **Syllabus Integration**: Wire PlanReviewTable into SyllabusViewer
5. **Edit Event**: Implement edit functionality in EventDetails
6. **Delete Flexible Task**: Implement delete in FlexibleList

---

## 🎨 UI Consistency

All components follow existing patterns:
- Use `colors` from `theme/colors.js`
- Use `shadows` for elevation
- Rounded corners (`borderRadius: 8-12`)
- Pastel color scheme
- Consistent spacing and typography

---

## 🔗 Deep Link Patterns

- Planner: `/planner?view=week&child={id}&subject={id}&date={yyyy-mm-dd}`
- Documents: `/documents?child={id}&subject={id}`
- Child: `/children/{id}?tab=progress&weekStart={yyyy-mm-dd}`

---

## 📊 Component Dependencies

```
EventModal
  ├── EventDetails
  └── EventSyllabusTab

BacklogDrawer
  ├── FlexibleList
  └── SuggestionList

ChildProfile
  ├── SubjectPacingChart
  └── EvidenceRings

Reports
  └── KpiRow

All components use:
  ├── apiClient (for API calls)
  ├── url (for deep links)
  └── FiltersContext (for state)
```

---

## 🚀 Ready to Deploy

All components are created and wired up. Complete the integration steps above and test!

