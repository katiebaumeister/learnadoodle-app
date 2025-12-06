# Planner Diff Viewer System

Complete reschedule diff viewer system for showing parents exactly what changed after the micro-rescheduler runs.

## Components

### 1. `PlannerDiffModal.tsx`
Main modal component that displays schedule changes in a timeline format.

### 2. `PlannerDiffTimelineItem.tsx`
Individual timeline item component showing old event → new event with reason.

### 3. `usePlannerDiffStore.ts`
State management store (Context-based, can be swapped for Zustand if desired).

## Setup

### 1. Install Zustand (Optional)
If you prefer Zustand over Context API:
```bash
npm install zustand
```

Then update `usePlannerDiffStore.ts` to use Zustand instead of Context.

### 2. Wrap App with Provider
In your root component (e.g., `App.js` or `WebLayout.js`):

```tsx
import { PlannerDiffProvider } from './app/state/usePlannerDiffStore';
import PlannerDiffModal from './app/components/schedule/PlannerDiffModal';

function App() {
  return (
    <PlannerDiffProvider>
      {/* Your app components */}
      <PlannerDiffModal 
        children={children} 
        subjects={subjects}
        onAccept={() => {
          // Refresh calendar or planner view
          window.dispatchEvent(new CustomEvent('refreshCalendar'));
        }}
        onUndoComplete={() => {
          // Refresh after undo
          window.dispatchEvent(new CustomEvent('refreshCalendar'));
        }}
      />
    </PlannerDiffProvider>
  );
}
```

### 3. Integrate with Backend Responses

When `adjustSchedule` or micro-rescheduler returns a diff:

```tsx
import { usePlannerDiffStore } from '../app/state/usePlannerDiffStore';

// In your component or API handler
const { setDiffItems } = usePlannerDiffStore();

// After calling adjustSchedule or micro-rescheduler
const response = await adjustSchedule({...});

if (response.data?.diff && Array.isArray(response.data.diff)) {
  setDiffItems(response.data.diff);
  // Modal will auto-open if diffs exist
}
```

## Backend Integration

### Update Backend to Return Diffs

In `backend/routers/schedule_routes.py` and `backend/ai/micro_rescheduler.py`, return diff array:

```python
# After rescheduling
diff_items = [
    {
        "task_id": task_id or None,
        "year_plan_id": year_plan_id or None,
        "title": "Math: Chapter 5",
        "subject_id": subject_id,
        "child_id": child_id,
        "old_event": {
            "start_ts": "2025-02-01T09:00:00Z",
            "end_ts": "2025-02-01T10:00:00Z"
        },
        "new_event": {
            "start_ts": "2025-02-03T14:00:00Z",
            "end_ts": "2025-02-03T15:00:00Z"
        },
        "reason": "blackout"  # or "override", "catch_up", "priority", "theme", "cognitive_load"
    }
]

return {
    "status": "ok",
    "scheduled": count,
    "diff": diff_items  # Add this
}
```

### Create Undo Backend Route

Create `backend/routers/schedule_routes.py` endpoint:

```python
@router.post("/undo_last_reschedule")
async def undo_last_reschedule(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """Undo the last reschedule operation by restoring events from backlog."""
    # Implementation: Track last reschedule operation and reverse it
    # This should restore events to their previous positions
    pass
```

## Usage

### Example Diff Item Structure

```typescript
{
  task_id: "uuid",           // Optional
  year_plan_id: "uuid",      // Alternative to task_id
  title: "Math: Chapter 5",
  subject_id: "uuid",        // Optional
  child_id: "uuid",
  old_event: {
    start_ts: "2025-02-01T09:00:00Z",
    end_ts: "2025-02-01T10:00:00Z"
  },
  new_event: {
    start_ts: "2025-02-03T14:00:00Z",
    end_ts: "2025-02-03T15:00:00Z"
  },
  reason: "blackout"  // One of: blackout, override, catch_up, priority, theme, cognitive_load
}
```

## Features

- ✅ Automatic modal opening when diffs are set
- ✅ Timeline visualization (old → new)
- ✅ Grouped by child
- ✅ Color-coded by reason
- ✅ Accept/Undo/Close actions
- ✅ Mobile responsive
- ✅ Subject and child name display

## Edge Cases Handled

- Empty diff array → modal doesn't open
- Undo button calls backend API
- Accept button closes modal
- All buttons have proper disabled states

