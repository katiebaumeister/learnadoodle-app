# Query Filtering Implementation Guide

## ✅ Completed

### 1. Core Infrastructure
- **SessionContext** - Provides session with role_flags and accessible_children
- **Query Filters** (`lib/queryFilters.js`) - Helper functions for automatic scoping

### 2. Updated Functions
- **`lib/toolData.js::fetchTasks()`** - Now accepts `session` param and applies filters
- **`lib/plannerService.js::getExistingEvents()`** - Now accepts `session` param and applies filters

### 3. Component Integration
- **WebLayout** - Gets session from context and passes to WebContent
- **WebContent** - Accepts session prop and can get from context

## 📋 Pattern for Applying Filters

### Step 1: Get Session
```javascript
// Option A: From props (if passed down)
const session = propSession;

// Option B: From context
import { useSession } from '../contexts/SessionContext';
const session = useSession();

// Option C: Try both
let session = propSession;
try {
  const { useSession } = require('../contexts/SessionContext');
  const contextSession = useSession();
  if (!session && !contextSession.loading) {
    session = contextSession;
  }
} catch (e) {
  // Context not available
}
```

### Step 2: Apply Filter to Query
```javascript
import { applyChildFilter } from '../lib/queryFilters';

let query = supabase
  .from('events')
  .select('*')
  .eq('family_id', familyId);

// Apply role-based filter
if (session) {
  query = applyChildFilter(query, session, 'child_id');
} else if (childId) {
  // Legacy fallback
  query = query.eq('child_id', childId);
}

const { data, error } = await query;
```

## 🔄 Remaining Queries to Update

### High Priority (Events)
1. **WebContent.js** - Line 829: Backlog query
2. **WebContent.js** - Line 1191: Conflict detection query
3. **WebContent.js** - Line 1930: Home data events
4. **WebContent.js** - Line 2349: Today's learning events
5. **WebContent.js** - Line 2526: Weekly pulse events
6. **WebContent.js** - Line 2645: Suggested rhythms
7. **WebContent.js** - Line 3785: Calendar events
8. **WebContent.js** - Line 4053: Planner events

### Medium Priority (Subjects)
1. **WebContent.js** - Subject queries
2. **SubjectsPage.js** - Subject list queries
3. **SubjectDetailPage.js** - Subject detail queries

### Medium Priority (Materials)
1. **MaterialsPage.js** - Material queries
2. **WebContent.js** - Material queries

### Lower Priority (Other)
1. **Grades queries** - Where grades are fetched
2. **Attendance queries** - Where attendance is fetched
3. **BacklogDrawer.js** - Backlog loading
4. **EventSearch.js** - Search queries
5. **FamilyCalendarView.js** - Calendar data

## 🎯 Quick Wins

For each query location:
1. Find the query builder (e.g., `supabase.from('events')`)
2. After `.eq('family_id', familyId)`, add:
   ```javascript
   if (session) {
     const { applyChildFilter } = await import('../lib/queryFilters');
     query = applyChildFilter(query, session, 'child_id');
   }
   ```
3. Remove any manual `child_id` filtering that's now redundant

## ⚠️ Important Notes

- **Always filter by family_id first** - This is required for RLS
- **Then apply child filter** - This scopes by role
- **Keep legacy fallbacks** - For backward compatibility
- **Test each role** - Parent, Child, Tutor should see correct data

## 🧪 Testing Pattern

For each updated query:
1. **Parent role**: Should see all children's data
2. **Child role**: Should see only their own data
3. **Tutor role**: Should see only assigned children's data
4. **No session**: Should fall back to legacy behavior
